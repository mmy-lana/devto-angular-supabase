import { Injectable, signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { inspectSupabaseConfiguration } from '../../../environments/environment.model';

/**
 * Base URL of the client built when the build has no credentials.
 *
 * Port 1 on the loopback interface refuses connections immediately, so any
 * request that slips past an `isConfigured` check fails fast and offline instead
 * of hanging or reaching a real service. Nothing is expected to reach it: every
 * service checks {@link SupabaseService.isConfigured} first and reads its
 * bundled sample data when the flag is false.
 */
const UNCONFIGURED_URL = 'http://127.0.0.1:1';

/** Key of the client built when the build has no credentials. */
const UNCONFIGURED_KEY = 'unconfigured-anon-key';

/**
 * Owns the single Supabase client instance for the application, and the
 * connectivity state every service reports into.
 *
 * The client is created eagerly on first injection, but a missing configuration
 * is no longer a fatal error. Production deployments routinely ship without
 * environment variables — a Vercel preview built before the variables were
 * added, or a static export used as a design reference — and those builds have
 * to render the bundled sample content rather than a startup error screen. When
 * the credentials are absent or still hold the `.env.example` placeholders, the
 * service builds a client pointed at a closed port and reports
 * `isConfigured: false`, which is what sends the data services down their local
 * fallback paths.
 *
 * The client is intentionally untyped: row shapes are declared as explicit
 * `*Row` interfaces in `core/models` and mapped to domain models at the service
 * boundary, which keeps query results honest without hand-maintaining PostgREST
 * relationship metadata.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  /** Shared Supabase client. Never sign out or replace it outside `AuthService`. */
  readonly client: SupabaseClient;

  /**
   * `true` when a usable remote URL and key are present in the build.
   *
   * When `false` every data service serves its bundled sample dataset, and
   * authentication is unavailable.
   */
  readonly isConfigured: boolean;

  /** Reasons the remote is unusable; empty when it is usable. */
  readonly configurationIssues: readonly string[];

  /**
   * `true` while the application is serving bundled sample content.
   *
   * Starts as `true` for an unconfigured build and is flipped by the data
   * services when a live request fails, so the shell can tell the reader which
   * source they are looking at instead of leaving them to guess.
   */
  readonly offlineModeSignal = signal<boolean>(false);

  /** Why the application is offline; empty while the remote is healthy. */
  readonly offlineReasonSignal = signal<string>('');

  constructor() {
    const report = inspectSupabaseConfiguration(environment);

    this.isConfigured = report.isConfigured;
    this.configurationIssues = report.issues;

    if (!report.isConfigured) {
      this.offlineModeSignal.set(true);
      this.offlineReasonSignal.set(report.issues.join('; '));

      console.warn(
        `[supabase] Running on bundled sample data: ${report.issues.join('; ')}. ` +
          'Set the Supabase variables in .env (see .env.example) and restart to use the live database.',
      );
    }

    this.client = createClient(
      report.isConfigured ? environment.supabaseUrl : UNCONFIGURED_URL,
      report.isConfigured ? environment.supabaseAnonKey : UNCONFIGURED_KEY,
      {
        auth: {
          persistSession: report.isConfigured,
          autoRefreshToken: report.isConfigured,
          detectSessionInUrl: report.isConfigured,
          flowType: 'pkce',
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'x-application-name': 'devto-mock-platform',
          },
        },
      },
    );
  }

  /**
   * Records that a live request failed and the caller served sample content.
   *
   * Logged once per transition so a page that falls back repeatedly does not
   * flood the console.
   */
  markOffline(reason: string): void {
    if (!this.offlineModeSignal()) {
      console.warn(`[supabase] Live requests are failing, serving sample data. Cause: ${reason}`);
    }

    this.offlineModeSignal.set(true);
    this.offlineReasonSignal.set(reason);
  }

  /** Records that a live request succeeded, clearing the offline state. */
  markOnline(): void {
    if (this.offlineModeSignal() && !this.isConfigured) {
      // An unconfigured build never becomes online; nothing can have succeeded.
      return;
    }

    this.offlineModeSignal.set(false);
    this.offlineReasonSignal.set('');
  }
}
