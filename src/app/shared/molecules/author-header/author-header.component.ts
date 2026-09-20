import { Component, computed, input } from '@angular/core';
import type { Profile } from '../../../core/models/profile.model';
import { AvatarComponent } from '../../ui/avatar/avatar.component';

/** Milliseconds in one day, used by the relative timestamp thresholds. */
const DAY_IN_MS = 86_400_000;

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
  protected readonly absoluteDate = computed(() => {
    const date = new Date(this.publishedAt());

    return Number.isNaN(date.getTime())
      ? this.publishedAt()
      : date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
  });
}

/** Formats an ISO timestamp as an age, falling back to a short date. */
function formatRelativeTime(isoTimestamp: string): string {
  const published = new Date(isoTimestamp);

  if (Number.isNaN(published.getTime())) {
    return isoTimestamp;
  }

  const elapsedMs = Date.now() - published.getTime();

  if (elapsedMs < 60_000) {
    return 'Just now';
  }

  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(elapsedMs / DAY_IN_MS);

  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return published.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: published.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
