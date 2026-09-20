import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CommentService } from '../../core/services/comment.service';
import { toErrorMessage } from '../../core/utils/error-message.util';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { TextareaComponent } from '../../shared/ui/textarea/textarea.component';

/** Maximum accepted comment length, mirrored in the character counter. */
const MAX_COMMENT_LENGTH = 1200;

/**
 * Comment input, used for both top-level comments and inline replies.
 *
 * Anonymous visitors get a sign-in prompt instead of a textarea they cannot use.
 * A failed insert keeps the typed text in place and renders the reason inline, so
 * nobody loses their draft to a network error.
 */
@Component({
  selector: 'app-comment-composer',
  imports: [FormsModule, AvatarComponent, ButtonComponent, TextareaComponent],
  template: `
    @if (authService.currentProfile(); as profile) {
      <div class="flex items-start space-x-2 sm:space-x-3">
        <app-avatar
          [src]="profile.avatarUrl"
          [alt]="profile.fullName"
          [fallbackSeed]="profile.username"
          size="sm"
        />

        <div class="flex-1 min-w-0">
          <app-textarea
            [(ngModel)]="commentText"
            [ngModelOptions]="{ standalone: true }"
            [placeholder]="placeholder()"
            [rows]="3"
            [maxLength]="maxCommentLength"
            [error]="errorMessage()"
            [disabled]="submitting()"
            aria-label="Write a comment"
          />

          <div class="flex items-center justify-between gap-2 mt-2">
            <p class="text-[11px] text-gray-500">
              Markdown is supported — be kind and stay on topic.
            </p>

            <div class="flex items-center space-x-2 shrink-0">
              @if (parentId()) {
                <app-button variant="ghost" size="sm" [disabled]="submitting()" (clicked)="cancel()">
                  Cancel
                </app-button>
              }
              <app-button
                variant="primary"
                size="sm"
                [disabled]="commentText().trim().length === 0"
                [loading]="submitting()"
                (clicked)="submitComment()"
              >
                {{ parentId() ? 'Reply' : 'Submit' }}
              </app-button>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-[#d4d4d4] bg-gray-50 px-4 py-3"
      >
        <div>
          <p class="text-sm font-medium text-gray-800">Join the discussion</p>
          <p class="text-xs text-gray-500">
            Sign in with GitHub or email to post a comment. Reading stays free.
          </p>
        </div>
        <app-button variant="primary" size="sm" (clicked)="authService.openAuthModal()">
          Sign in to comment
        </app-button>
      </div>
    }
  `,
})
export class CommentComposerComponent {
  protected readonly authService = inject(AuthService);
  private readonly commentService = inject(CommentService);

  postId = input.required<string>();
  parentId = input<string | null>(null);
  placeholder = input<string>('Add to the discussion...');

  commentCreated = output<void>();
  canceled = output<void>();

  protected readonly maxCommentLength = MAX_COMMENT_LENGTH;
  protected readonly commentText = signal<string>('');
  protected readonly submitting = signal<boolean>(false);
  protected readonly errorMessage = signal<string>('');

  async submitComment(): Promise<void> {
    const body = this.commentText().trim();

    if (body.length === 0 || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      await this.commentService.addComment(this.postId(), body, this.parentId());
      this.commentText.set('');
      this.commentCreated.emit();
    } catch (error) {
      this.errorMessage.set(toErrorMessage(error, 'Could not publish your comment.'));
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.commentText.set('');
    this.errorMessage.set('');
    this.canceled.emit();
  }
}
