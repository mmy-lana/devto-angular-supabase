import { Component, input, output } from '@angular/core';
import type { CommentNode } from '../../core/models/comment.model';
import { CommentItemComponent } from './comment-item.component';

/**
 * Renders a post's discussion.
 *
 * Events bubble up untouched: the page owns the service calls, which keeps the
 * tree a pure view over the comment signal.
 */
@Component({
  selector: 'app-comment-tree',
  imports: [CommentItemComponent],
  template: `
    <div class="space-y-4">
      @for (comment of comments(); track comment.id) {
        <app-comment-item
          [comment]="comment"
          [currentUserId]="currentUserId()"
          (likeToggled)="likeToggled.emit($event)"
          (replyCreated)="replyCreated.emit()"
          (deleteRequested)="deleteRequested.emit($event)"
        />
      } @empty {
        <p class="text-sm text-gray-500 py-4 text-center">
          No comments yet. Be the first to start the conversation!
        </p>
      }
    </div>
  `,
})
export class CommentTreeComponent {
  comments = input.required<CommentNode[]>();
  /** Signed-in visitor, forwarded to every node so authors can delete their own. */
  currentUserId = input<string | null>(null);

  likeToggled = output<string>();
  replyCreated = output<void>();
  deleteRequested = output<string>();
}
