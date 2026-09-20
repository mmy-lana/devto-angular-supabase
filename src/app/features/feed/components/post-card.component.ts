import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PostSummary } from '../../../core/models/post.model';
import type { ReactionType } from '../../../core/models/reaction.model';
import type { Tag } from '../../../core/models/tag.model';
import { AuthorHeaderComponent } from '../../../shared/molecules/author-header/author-header.component';
import { TagPillComponent } from '../../../shared/molecules/tag-pill/tag-pill.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Feed card.
 *
 * The whole box is clickable for pointer users, and the title is additionally a
 * real link so the same destination is reachable by keyboard and can be opened
 * in a new tab. The reaction, comment and bookmark controls stop propagation so
 * acting on a card never navigates away from the feed.
 */
@Component({
  selector: 'app-post-card',
  imports: [RouterLink, AuthorHeaderComponent, TagPillComponent, IconComponent],
  template: `
    <article
      [routerLink]="['/post', post().slug]"
      class="bg-white border border-[#d4d4d4] hover:border-[#a3a3a3] rounded-md mb-2 sm:mb-3 overflow-hidden transition-all duration-150 cursor-pointer group shadow-sm"
    >
      @if (showCoverImage() && post().coverImageUrl) {
        <div class="w-full h-44 sm:h-64 overflow-hidden border-b border-[#e2e8f0] bg-gray-100">
          <img
            [src]="post().coverImageUrl"
            [alt]="post().title"
            class="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-200"
            loading="lazy"
          />
        </div>
      }

      <div class="p-3 sm:p-4 lg:p-5">
        <div class="mb-3">
          <app-author-header [author]="post().author" [publishedAt]="post().createdAt" />
        </div>

        <div class="pl-0 sm:pl-10">
          <h2 class="text-lg sm:text-2xl font-bold leading-snug mb-2">
            <a
              [routerLink]="['/post', post().slug]"
              class="text-gray-900 group-hover:text-[#3b49df] transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df] focus-visible:ring-offset-2"
            >
              {{ post().title }}
            </a>
          </h2>

          @if (post().tags.length > 0) {
            <!-- Tag clicks filter the feed, so they must not also open the post. -->
            <div class="flex flex-wrap items-center mb-3" (click)="$event.stopPropagation()">
              @for (tag of post().tags; track tag.id) {
                <app-tag-pill [tag]="tag" [selectable]="true" (selected)="tagSelected.emit($event)" />
              }
            </div>
          }

          <div class="flex items-center justify-between gap-2 pt-1 text-xs text-gray-500">
            <div class="flex items-center space-x-1 sm:space-x-3">
              <button
                type="button"
                class="inline-flex items-center space-x-1.5 min-h-11 px-2 rounded hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]"
                [attr.aria-pressed]="post().userReactions.like"
                [attr.aria-label]="
                  (post().userReactions.like ? 'Remove your reaction from ' : 'React to ') + post().title
                "
                (click)="$event.stopPropagation(); reactionToggled.emit('like')"
              >
                <span [class]="post().userReactions.like ? 'text-red-500' : 'text-gray-400'">
                  <app-icon name="heart" size="sm" [filled]="post().userReactions.like" />
                </span>
                <span class="font-medium text-gray-700">{{ post().reactionsCount }}</span>
                <span class="hidden sm:inline">reactions</span>
              </button>

              <a
                [routerLink]="['/post', post().slug]"
                class="inline-flex items-center space-x-1.5 min-h-11 px-2 rounded hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]"
                [attr.aria-label]="post().commentsCount + ' comments on ' + post().title"
                (click)="$event.stopPropagation()"
              >
                <app-icon name="comment" size="sm" />
                <span class="font-medium text-gray-700">{{ post().commentsCount }}</span>
                <span class="hidden sm:inline">comments</span>
              </a>
            </div>

            <div class="flex items-center space-x-1 shrink-0">
              <span class="text-[11px] sm:text-xs text-gray-500">
                {{ post().readingTimeMinutes }} min read
              </span>

              <button
                type="button"
                class="min-h-11 min-w-11 inline-flex items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]"
                [class]="post().userReactions.bookmark ? 'text-[#3b49df]' : 'text-gray-400 hover:text-gray-900'"
                [attr.aria-pressed]="post().userReactions.bookmark"
                [attr.aria-label]="
                  (post().userReactions.bookmark ? 'Remove bookmark from ' : 'Bookmark ') + post().title
                "
                (click)="$event.stopPropagation(); bookmarkToggled.emit(post().id)"
              >
                <app-icon name="bookmark" size="sm" [filled]="post().userReactions.bookmark" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  `,
})
export class PostCardComponent {
  post = input.required<PostSummary>();
  /** Renders the cover banner; enabled for the first card of the feed. */
  showCoverImage = input<boolean>(false);

  reactionToggled = output<ReactionType>();
  bookmarkToggled = output<string>();
  tagSelected = output<Tag>();
}
