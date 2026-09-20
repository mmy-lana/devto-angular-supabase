import { Component, input, output, signal } from '@angular/core';
import type { CommentNode } from '../../core/models/comment.model';
import { formatRelativeTime } from '../../core/utils/date.util';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { CommentComposerComponent } from './comment-composer.component';

/**
 * One comment and, recursively, its replies.
 *
 * The node owns three pieces of purely local state: whether the inline reply box
 * is open, whether the delete confirmation is showing, and nothing else — the
 * like state lives in the tree signal so an optimistic toggle and a rollback
 * both render from a single source of truth.
 */
@Component({
  selector: 'app-comment-item',
  imports: [AvatarComponent, IconComponent, CommentComposerComponent],
  template: `
    <div
      [id]="'comment-' + comment().id"
      class="comment-node relative mt-3 group"
      [style.--comment-depth]="comment().depth"
    >
      @if (comment().depth > 0) {
        <div class="absolute -left-2 sm:-left-3 top-0 bottom-0 w-0.5 bg-gray-200 group-hover:bg-gray-300"></div>
      }

      <div class="flex items-start space-x-2 sm:space-x-3">
        <app-avatar
          [src]="comment().author.avatarUrl"
          [alt]="comment().author.fullName"
          [fallbackSeed]="comment().author.username"
          size="sm"
        />

        <div class="flex-1 min-w-0 border border-[#e2e8f0] rounded-md p-3 sm:p-4 bg-white shadow-sm">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center space-x-2 min-w-0">
              <span class="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                {{ comment().author.fullName }}
              </span>
              @if (comment().depth > 3) {
                <span class="text-[10px] text-gray-500 font-mono shrink-0">replied to parent</span>
              }
              <time
                class="text-[11px] text-gray-400 shrink-0"
                [attr.datetime]="comment().createdAt"
              >
                &bull; {{ relativeDate() }}
              </time>
            </div>

            @if (isOwnComment()) {
              <button
                type="button"
                class="shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2 rounded text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                [attr.aria-label]="'Delete your comment on ' + comment().author.fullName"
                (click)="isConfirmingDelete.set(true)"
              >
                <app-icon name="trash" size="xs" />
                Delete
              </button>
            }
          </div>

          @if (isConfirmingDelete()) {
            <div class="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p class="text-xs text-red-800 mb-2">Delete this comment? Replies stay visible.</p>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="min-h-[44px] min-w-[44px] px-3 rounded bg-red-600 text-white text-[11px] font-medium hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  (click)="confirmDelete()"
                >
                  Delete
                </button>
                <button
                  type="button"
                  class="min-h-[44px] min-w-[44px] px-3 rounded text-[11px] font-medium text-gray-600 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                  (click)="isConfirmingDelete.set(false)"
                >
                  Keep it
                </button>
              </div>
            </div>
          }

          @if (comment().isDeleted) {
            <p class="text-xs text-gray-400 italic py-1">[This comment was deleted by its author]</p>
          } @else {
            <div
              class="devto-comment text-xs sm:text-sm text-gray-800 break-words"
              [innerHTML]="comment().contentHtml"
            ></div>
          }

          <div class="flex items-center space-x-1 mt-2 pt-1 text-xs text-gray-500">
            <button
              type="button"
              class="min-h-11 min-w-11 inline-flex items-center justify-center space-x-1 rounded hover:text-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              [class]="comment().hasLiked ? 'text-red-600' : ''"
              [attr.aria-pressed]="comment().hasLiked"
              [attr.aria-label]="(comment().hasLiked ? 'Remove your like from ' : 'Like ') + 'this comment'"
              (click)="likeToggled.emit(comment().id)"
            >
              <app-icon name="heart" size="xs" [filled]="comment().hasLiked" />
              <span>{{ comment().likesCount }}</span>
            </button>

            @if (!comment().isDeleted) {
              <button
                type="button"
                class="min-h-11 px-3 inline-flex items-center justify-center rounded hover:text-[#3b49df] hover:bg-gray-50 transition-colors font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]"
                [attr.aria-expanded]="isReplying()"
                (click)="isReplying.set(!isReplying())"
              >
                {{ isReplying() ? 'Close' : 'Reply' }}
              </button>
            }
          </div>

          @if (isReplying()) {
            <div class="mt-3 pt-3 border-t border-gray-100">
              <app-comment-composer
                [postId]="comment().postId"
                [parentId]="comment().id"
                [placeholder]="'Replying to ' + comment().author.fullName + '...'"
                (commentCreated)="onReplySubmitted()"
                (canceled)="isReplying.set(false)"
              />
            </div>
          }
        </div>
      </div>

      @if (comment().replies.length > 0) {
        <div class="space-y-2 mt-1">
          @for (child of comment().replies; track child.id) {
            <app-comment-item
              [comment]="child"
              [currentUserId]="currentUserId()"
              (likeToggled)="likeToggled.emit($event)"
              (replyCreated)="replyCreated.emit()"
              (deleteRequested)="deleteRequested.emit($event)"
            />
          }
        </div>
      }
    </div>
  `,
})
export class CommentItemComponent {
  comment = input.required<CommentNode>();
  /** Signed-in visitor, used to decide whether this comment can be deleted. */
  currentUserId = input<string | null>(null);

  likeToggled = output<string>();
  replyCreated = output<void>();
  deleteRequested = output<string>();

  protected readonly isReplying = signal<boolean>(false);
  protected readonly isConfirmingDelete = signal<boolean>(false);

  protected readonly relativeDate = (): string => formatRelativeTime(this.comment().createdAt);

  /** Only the author of a live comment may delete it. */
  protected isOwnComment(): boolean {
    return !this.comment().isDeleted && this.currentUserId() === this.comment().authorId;
  }

  protected confirmDelete(): void {
    this.isConfirmingDelete.set(false);
    this.deleteRequested.emit(this.comment().id);
  }

  protected onReplySubmitted(): void {
    this.isReplying.set(false);
    this.replyCreated.emit();
  }
}
