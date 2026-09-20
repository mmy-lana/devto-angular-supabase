import { Component, input, output } from '@angular/core';
import type { ReactionType, UserReactionsState } from '../../../core/models/reaction.model';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Reaction rail for the article view.
 *
 * It docks to the left edge as a sticky vertical rail from 1024px up, and to the
 * bottom edge as a fixed bar below that. `hidden lg:flex` / `lg:hidden` keep
 * exactly one of the two in the layout, so the shell can hide its own bottom
 * dock on this route without leaving a gap.
 *
 * The fixed bar reserves the device safe area (A11Y-01): its height is a minimum
 * rather than a fixed 3.5rem, and `env(safe-area-inset-bottom)` is added as
 * padding, so on a phone with a home indicator the controls sit above it instead
 * of underneath it. The shell pads the page by the same amount, which keeps the
 * end of the article reachable.
 */
@Component({
  selector: 'app-reaction-floating-bar',
  imports: [IconComponent],
  template: `
    <div class="hidden lg:flex flex-col items-center space-y-5 sticky top-24 select-none">
      <button
        type="button"
        class="flex flex-col items-center"
        [attr.aria-pressed]="reactions().like"
        [attr.aria-label]="reactions().like ? 'Remove your heart reaction' : 'React with a heart'"
        (click)="reactionClicked.emit('like')"
      >
        <span
          class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          [class]="reactions().like ? 'bg-red-50 text-red-500' : 'text-gray-600 hover:bg-red-50'"
        >
          <app-icon name="heart" size="lg" [filled]="reactions().like" />
        </span>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ likesCount() }}</span>
      </button>

      <button
        type="button"
        class="flex flex-col items-center"
        [attr.aria-pressed]="reactions().unicorn"
        [attr.aria-label]="reactions().unicorn ? 'Remove your unicorn reaction' : 'React with a unicorn'"
        (click)="reactionClicked.emit('unicorn')"
      >
        <span
          class="w-10 h-10 rounded-full flex items-center justify-center text-emerald-600 transition-colors"
          [class]="reactions().unicorn ? 'bg-emerald-50' : 'hover:bg-emerald-50'"
        >
          <app-icon name="unicorn" size="lg" />
        </span>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ unicornsCount() }}</span>
      </button>

      <button
        type="button"
        class="flex flex-col items-center"
        [attr.aria-pressed]="reactions().bookmark"
        [attr.aria-label]="
          reactions().bookmark ? 'Remove this post from your reading list' : 'Save to reading list'
        "
        (click)="reactionClicked.emit('bookmark')"
      >
        <span
          class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          [class]="reactions().bookmark ? 'bg-indigo-50 text-[#3b49df]' : 'text-gray-600 hover:bg-indigo-50'"
        >
          <app-icon name="bookmark" size="lg" [filled]="reactions().bookmark" />
        </span>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ bookmarksCount() }}</span>
      </button>

      <button
        type="button"
        class="flex flex-col items-center"
        [attr.aria-label]="commentsCount() + ' comments — jump to the discussion'"
        (click)="commentsJump.emit()"
      >
        <span class="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100">
          <app-icon name="comment" size="lg" />
        </span>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ commentsCount() }}</span>
      </button>
    </div>

    <div
      class="lg:hidden fixed bottom-0 left-0 right-0 min-h-14 pb-[env(safe-area-inset-bottom)] bg-white border-t border-[#e2e8f0] flex items-center justify-around z-30 px-2 shadow-md"
    >
      <button
        type="button"
        class="flex items-center gap-1.5 min-h-11 min-w-11 justify-center px-2 rounded"
        [attr.aria-pressed]="reactions().like"
        aria-label="Heart reaction"
        (click)="reactionClicked.emit('like')"
      >
        <span [class]="reactions().like ? 'text-red-500' : 'text-gray-600'">
          <app-icon name="heart" size="md" [filled]="reactions().like" />
        </span>
        <span class="text-xs font-bold text-gray-700">{{ likesCount() }}</span>
      </button>

      <button
        type="button"
        class="flex items-center gap-1.5 min-h-11 min-w-11 justify-center px-2 rounded"
        [attr.aria-pressed]="reactions().unicorn"
        aria-label="Unicorn reaction"
        (click)="reactionClicked.emit('unicorn')"
      >
        <span [class]="reactions().unicorn ? 'text-emerald-600' : 'text-gray-600'">
          <app-icon name="unicorn" size="md" />
        </span>
        <span class="text-xs font-bold text-gray-700">{{ unicornsCount() }}</span>
      </button>

      <button
        type="button"
        class="flex items-center gap-1.5 min-h-11 min-w-11 justify-center px-2 rounded"
        [attr.aria-pressed]="reactions().bookmark"
        aria-label="Bookmark post"
        (click)="reactionClicked.emit('bookmark')"
      >
        <span [class]="reactions().bookmark ? 'text-[#3b49df]' : 'text-gray-600'">
          <app-icon name="bookmark" size="md" [filled]="reactions().bookmark" />
        </span>
        <span class="text-xs font-bold text-gray-700">{{ bookmarksCount() }}</span>
      </button>

      <button
        type="button"
        class="flex items-center gap-1.5 min-h-11 min-w-11 justify-center px-2 rounded"
        [attr.aria-label]="commentsCount() + ' comments'"
        (click)="commentsJump.emit()"
      >
        <span class="text-gray-600"><app-icon name="comment" size="md" /></span>
        <span class="text-xs font-bold text-gray-700">{{ commentsCount() }}</span>
      </button>
    </div>
  `,
})
export class ReactionFloatingBarComponent {
  reactions = input.required<UserReactionsState>();
  likesCount = input<number>(0);
  unicornsCount = input<number>(0);
  bookmarksCount = input<number>(0);
  commentsCount = input<number>(0);

  reactionClicked = output<ReactionType>();
  commentsJump = output<void>();
}
