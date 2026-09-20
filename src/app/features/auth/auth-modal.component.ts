import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { InputComponent } from '../../shared/ui/input/input.component';

/**
 * Sign-in dialog offering GitHub OAuth or a passwordless email link.
 *
 * The form reports the service's own error text (invalid address, rate limit,
 * network failure) instead of a generic message, keeps the typed address on
 * failure, confirms delivery on success, and closes on Escape, on a backdrop
 * click or through the close button.
 */
@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule, ButtonComponent, IconComponent, InputComponent],
  host: {
    '(document:keydown.escape)': 'requestClose()',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Sign in to DEV Community',
  },
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm"
      (click)="requestClose()"
    >
      <div
        class="bg-white border border-[#d4d4d4] rounded-lg w-full max-w-md p-6 relative shadow-xl max-h-[90vh] overflow-y-auto"
        (click)="$event.stopPropagation()"
      >
        <button
          #closeButton
          type="button"
          class="absolute top-3 right-3 min-h-11 min-w-11 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          aria-label="Close sign-in dialog"
          (click)="requestClose()"
        >
          <app-icon name="close" size="md" />
        </button>

        <div class="text-center mb-6">
          <span
            class="bg-black text-white font-black text-xl px-2.5 py-1 rounded font-mono inline-block mb-2"
          >
            DEV
          </span>
          <h2 class="text-xl font-bold text-gray-900">Join the DEV Community</h2>
          <p class="text-xs text-gray-500 mt-1">
            Sign in to publish posts, react and join the discussion.
          </p>
        </div>

        @if (magicLinkSent()) {
          <div class="text-center space-y-4">
            <p class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
              Login link sent to <strong>{{ email() }}</strong>. Open it on this device to finish
              signing in.
            </p>
            <app-button variant="secondary" size="md" [fullWidth]="true" (clicked)="requestClose()">
              Back to reading
            </app-button>
          </div>
        } @else {
          <div class="space-y-3">
            <button
              type="button"
              class="w-full min-h-11 flex items-center justify-center gap-2 px-4 border border-[#d4d4d4] rounded-md text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-60"
              [disabled]="authService.isPending()"
              (click)="signInWithGithub()"
            >
              <app-icon name="github" size="md" />
              <span>Continue with GitHub</span>
            </button>

            <div class="flex items-center my-4">
              <div class="flex-1 border-t border-gray-200"></div>
              <span class="px-3 text-[11px] text-gray-400 uppercase tracking-wide">or</span>
              <div class="flex-1 border-t border-gray-200"></div>
            </div>

            <form class="space-y-3" (submit)="sendMagicLink($event)">
              <app-input
                label="Email"
                type="email"
                name="email"
                autocomplete="email"
                placeholder="name@example.com"
                hint="We email you a one-time sign-in link. No password needed."
                [required]="true"
                [error]="errorMessage()"
                [(ngModel)]="email"
              />

              <app-button
                type="submit"
                variant="primary"
                size="md"
                [fullWidth]="true"
                [loading]="sendingMagicLink()"
                [disabled]="email().trim().length === 0"
              >
                Send login link
              </app-button>
            </form>

            <p class="text-[11px] text-gray-500 text-center pt-2">
              Signing in only stores your profile, posts, reactions and bookmarks.
            </p>
          </div>
        }
      </div>
    </div>
  `,
})
export class AuthModalComponent {
  protected readonly authService = inject(AuthService);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  closed = output<void>();

  protected readonly email = signal<string>('');
  protected readonly sendingMagicLink = signal<boolean>(false);
  protected readonly magicLinkSent = signal<boolean>(false);

  /** Errors raised by either sign-in path, cleared when a new attempt starts. */
  protected readonly errorMessage = computed(() => this.authService.errorMessage() ?? '');

  constructor() {
    // Move focus into the dialog so keyboard users are not left behind it; the
    // button exists after the first render, which is when this effect runs.
    effect(() => {
      this.closeButton()?.nativeElement.focus();
    });
  }

  protected async signInWithGithub(): Promise<void> {
    this.magicLinkSent.set(false);
    this.authService.clearError();
    await this.authService.signInWithGithub();
  }

  protected async sendMagicLink(event: Event): Promise<void> {
    event.preventDefault();
    const address = this.email().trim();

    if (address.length === 0 || this.sendingMagicLink()) {
      return;
    }

    this.sendingMagicLink.set(true);
    this.magicLinkSent.set(false);
    this.authService.clearError();

    const { error } = await this.authService.signInWithEmail(address);

    this.sendingMagicLink.set(false);
    this.magicLinkSent.set(error === null);
  }

  protected requestClose(): void {
    this.authService.clearError();
    this.closed.emit();
  }
}
