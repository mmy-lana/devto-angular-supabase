import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { mapProfileRow, type Profile, type ProfileRow } from '../models/profile.model';
import { toErrorMessage } from '../utils/error-message.util';

/** Result of an interactive auth action. `error` stays `null` on success. */
export interface AuthActionResult {
  readonly error: Error | null;
}

/**
 * Deliberately permissive subset of RFC 5322: enough to reject obvious typos
 * before spending a round trip on them.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Reactive wrapper around Supabase authentication.
 *
 * The session, the mirrored profile row and the auth-modal state are exposed as
 * signals, so any template or service can react to sign-in/out without polling.
 * Profile rows are created by the `on_auth_user_created` database trigger; this
 * service only reads them back.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly supabase = this.supabaseService.client;
  private readonly destroyRef = inject(DestroyRef);

  private readonly sessionSignal = signal<Session | null>(null);
  private readonly profileSignal = signal<Profile | null>(null);
  private readonly authModalOpenSignal = signal<boolean>(false);
  private readonly initializingSignal = signal<boolean>(true);
  private readonly pendingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);

  private initialization: Promise<void> | null = null;
  private authStateSubscription: Subscription | null = null;

  /** Current Supabase session, or `null` for anonymous visitors. */
  readonly currentSession = this.sessionSignal.asReadonly();
  /** Auth user of the current session. */
  readonly currentUser = computed<User | null>(() => this.sessionSignal()?.user ?? null);
  /** Profile row mirroring the current user. */
  readonly currentProfile = this.profileSignal.asReadonly();
  /** `true` when a session exists. */
  readonly isAuthenticated = computed<boolean>(() => this.sessionSignal() !== null);
  /** `true` while the sign-in modal is open. */
  readonly isAuthModalOpen = this.authModalOpenSignal.asReadonly();
  /** `true` until the restored session has been resolved on startup. */
  readonly isInitializing = this.initializingSignal.asReadonly();
  /** `true` while an auth request is in flight. */
  readonly isPending = this.pendingSignal.asReadonly();
  /** Last auth failure, ready to render in the modal. */
  readonly errorMessage = this.errorSignal.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.dispose());
    void this.initialize();
  }

  /**
   * Restores the persisted session once and hydrates the profile.
   *
   * Idempotent: concurrent callers share the same promise, which lets the app
   * bootstrap await it without racing the constructor.
   */
  initialize(): Promise<void> {
    this.initialization ??= this.restoreSession();
    return this.initialization;
  }

  /**
   * Reads the profile row of a user and publishes it to `currentProfile`.
   *
   * Returns `null` when the row is missing or unreadable, in which case
   * `errorMessage` carries the reason.
   */
  async loadUserProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle<ProfileRow>();

      if (error) {
        throw error;
      }

      if (!data) {
        this.profileSignal.set(null);
        this.errorSignal.set(
          'This account has no profile row yet. The on_auth_user_created trigger must run when the user is created.',
        );
        return null;
      }

      const profile = mapProfileRow(data);
      this.profileSignal.set(profile);
      return profile;
    } catch (error) {
      this.profileSignal.set(null);
      this.errorSignal.set(toErrorMessage(error, 'Could not load your profile.'));
      return null;
    }
  }

  /** Re-fetches the profile of the current user; no-op when signed out. */
  reloadProfile(): Promise<Profile | null> {
    const user = this.currentUser();
    return user ? this.loadUserProfile(user.id) : Promise.resolve(null);
  }

  /** Opens the sign-in modal and clears any previous failure. */
  openAuthModal(): void {
    this.errorSignal.set(null);
    this.authModalOpenSignal.set(true);
  }

  /** Closes the sign-in modal. */
  closeAuthModal(): void {
    this.authModalOpenSignal.set(false);
  }

  /** Clears the last auth failure shown by the modal. */
  clearError(): void {
    this.errorSignal.set(null);
  }

  /**
   * Starts the GitHub OAuth flow. The browser leaves the page, so a resolved
   * result only means the redirect was handed to Supabase successfully.
   */
  signInWithGithub(): Promise<AuthActionResult> {
    const configurationError = this.requireConfiguration('Signing in');

    if (configurationError) {
      return Promise.resolve({ error: configurationError });
    }

    return this.runAuthAction(
      () =>
        this.supabase.auth.signInWithOAuth({
          provider: 'github',
          options: { redirectTo: this.redirectUrl() },
        }),
      'Could not start the GitHub sign-in flow.',
    );
  }

  /**
   * Sends a passwordless magic link to `email`.
   *
   * The address is validated locally first so a typo never costs a round trip.
   */
  async signInWithEmail(email: string): Promise<AuthActionResult> {
    const configurationError = this.requireConfiguration('Signing in');

    if (configurationError) {
      return { error: configurationError };
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      const message = 'Enter a valid email address.';
      this.errorSignal.set(message);
      return { error: new Error(message) };
    }

    return this.runAuthAction(
      () =>
        this.supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo: this.redirectUrl(),
            shouldCreateUser: true,
          },
        }),
      'Could not send the magic link.',
    );
  }

  /** Ends the session locally and on the server. */
  async signOut(): Promise<AuthActionResult> {
    const configurationError = this.requireConfiguration('Signing out');

    if (configurationError) {
      return { error: configurationError };
    }

    const result = await this.runAuthAction(
      () => this.supabase.auth.signOut(),
      'Could not sign out.',
    );

    if (!result.error) {
      // Reset immediately so the UI never shows a stale signed-in header while
      // the SIGNED_OUT event travels through the auth state listener.
      this.applySession(null);
      this.profileSignal.set(null);
    }

    return result;
  }

  /**
   * Refuses an interactive auth action when the build has no Supabase project.
   *
   * Every auth endpoint needs the remote, so failing here turns an opaque fetch
   * failure into a message that explains why sign-in is unavailable.
   */
  private requireConfiguration(action: string): Error | null {
    if (this.supabaseService.isConfigured) {
      return null;
    }

    const message =
      `${action} needs a Supabase connection. This build is running on bundled sample content, ` +
      'so accounts are unavailable.';

    this.errorSignal.set(message);

    return new Error(message);
  }

  /** Absolute URL Supabase redirects back to after OAuth or magic-link sign-in. */
  private redirectUrl(): string {
    return window.location.origin;
  }

  private async restoreSession(): Promise<void> {
    this.initializingSignal.set(true);

    // Subscribed before the first read so a token refresh or a sign-in that lands
    // while the stored session is still being resolved is never missed.
    this.listenToAuthStateChanges();

    try {
      const { data, error } = await this.supabase.auth.getSession();

      if (error) {
        throw error;
      }

      if (data.session) {
        this.applySession(data.session);
        await this.loadUserProfile(data.session.user.id);
      }
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not restore the previous session.'));
    } finally {
      this.initializingSignal.set(false);
    }
  }

  private listenToAuthStateChanges(): void {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      this.applySession(session);

      if (event === 'INITIAL_SESSION') {
        // Already hydrated by `restoreSession`; avoids a duplicate profile fetch.
        return;
      }

      // Supabase dispatches this callback while holding its internal auth lock,
      // so follow-up queries are deferred to the next macrotask instead of being
      // awaited inline.
      setTimeout(() => {
        void this.handleAuthStateChange(event, session);
      }, 0);
    });

    this.authStateSubscription = data.subscription;
  }

  private async handleAuthStateChange(
    event: AuthChangeEvent,
    session: Session | null,
  ): Promise<void> {
    if (!session?.user) {
      this.profileSignal.set(null);
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      await this.loadUserProfile(session.user.id);
    }

    if (event === 'SIGNED_IN') {
      this.errorSignal.set(null);
      this.authModalOpenSignal.set(false);
    }
  }

  private applySession(session: Session | null): void {
    this.sessionSignal.set(session);

    if (!session) {
      this.profileSignal.set(null);
    }
  }

  private async runAuthAction(
    action: () => PromiseLike<{ error: unknown }>,
    fallbackMessage: string,
  ): Promise<AuthActionResult> {
    this.errorSignal.set(null);
    this.pendingSignal.set(true);

    try {
      const { error } = await action();

      if (error) {
        throw error;
      }

      return { error: null };
    } catch (error) {
      const message = toErrorMessage(error, fallbackMessage);
      this.errorSignal.set(message);
      return { error: new Error(message) };
    } finally {
      this.pendingSignal.set(false);
    }
  }

  private dispose(): void {
    this.authStateSubscription?.unsubscribe();
    this.authStateSubscription = null;
    this.initialization = null;
  }
}
