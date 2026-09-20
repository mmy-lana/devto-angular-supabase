import { Component, computed, input } from '@angular/core';
import type { Profile } from '../../../core/models/profile.model';
import { formatAbsoluteDateTime, formatRelativeTime } from '../../../core/utils/date.util';
import { AvatarComponent } from '../../ui/avatar/avatar.component';

/**
 * Compact author byline: avatar, display name, `@username` and when the content
 * was published.
 *
 * Timestamps read relatively while they are recent ("3 hours ago") because that
 * is what a feed reader cares about, and switch to a short absolute date once
 * the post is older than a month.
 */
@Component({
  selector: 'app-author-header',
  imports: [AvatarComponent],
  template: `
    <div class="flex items-center space-x-2.5 min-w-0">
      <app-avatar [src]="author().avatarUrl" [alt]="author().fullName" size="sm" [fallbackSeed]="author().username" />

      <div class="flex flex-col min-w-0">
        <span class="flex items-center gap-1 min-w-0">
          <span class="text-xs sm:text-sm font-semibold text-gray-900 leading-tight truncate">
            {{ author().fullName }}
          </span>
          <span class="hidden sm:inline text-[11px] text-gray-500 leading-tight truncate">
            &#64;{{ author().username }}
          </span>
        </span>

        <time
          class="text-[11px] sm:text-xs text-gray-500 leading-tight"
          [attr.datetime]="publishedAt()"
          [attr.title]="absoluteDate()"
        >
          {{ relativeDate() }}
        </time>
      </div>
    </div>
  `,
})
export class AuthorHeaderComponent {
  author = input.required<Profile>();
  /** ISO timestamp the content was published at. */
  publishedAt = input.required<string>();

  /** Human readable age of the post, e.g. `3 hours ago`. */
  protected readonly relativeDate = computed(() => formatRelativeTime(this.publishedAt()));

  /** Exact date used as the `title` tooltip next to the relative label. */
  protected readonly absoluteDate = computed(() => formatAbsoluteDateTime(this.publishedAt()));
}

