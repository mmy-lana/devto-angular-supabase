import { Component, inject, OnInit, signal } from '@angular/core';
import { PostService } from '../../../core/services/post.service';

/** How many discussions the sidebar lists. */
const DISCUSSION_LIMIT = 3;

/**
 * Right column (large desktop only).
 *
 * `#discuss` is real data — the posts with the most comments — while the
 * listings block is editorial copy, exactly as it appears on DEV.
 */
@Component({
  selector: 'app-right-sidebar',
  template: `
    <aside class="space-y-4">
      <section id="discuss" class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
        <h3 class="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">#discuss</h3>

        @if (loading()) {
          <div class="space-y-3" role="status" aria-live="polite">
            @for (placeholder of [1, 2, 3]; track placeholder) {
              <div class="h-8 rounded bg-gray-100 animate-pulse"></div>
            }
            <span class="sr-only">Loading discussions…</span>
          </div>
        } @else if (posts().length === 0) {
          <p class="text-xs text-gray-500">
            Quiet in here. Be the first to comment on a post and start the conversation.
          </p>
        } @else {
          <div class="divide-y divide-gray-100 text-xs">
            @for (post of posts(); track post.id) {
              <div class="py-2.5">
                <a
                  [href]="'/post/' + post.slug"
                  class="font-medium text-gray-800 hover:text-[#3b49df] block leading-snug"
                >
                  {{ post.title }}
                </a>
                <span class="text-[11px] text-gray-400 mt-1 block">
                  {{ post.commentsCount }} comment{{ post.commentsCount === 1 ? '' : 's' }}
                </span>
              </div>
            }
          </div>
        }
      </section>

      <section class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
        <h3 class="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">Listings</h3>
        <div class="text-xs space-y-2 text-gray-700">
          <p class="font-medium leading-snug">Senior Frontend Engineer &bull; Remote</p>
          <p class="font-medium leading-snug">Free open source observability tool</p>
          <p class="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
            Community listings are informational in this build.
          </p>
        </div>
      </section>

      <section class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
        <h3 class="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">
          Writing on DEV
        </h3>
        <ul class="text-xs text-gray-600 space-y-1.5 pl-4 list-disc">
          <li>Draft in markdown with a live preview.</li>
          <li>Tag posts so readers can filter by topic.</li>
          <li>Reactions and comments update instantly.</li>
        </ul>
      </section>
    </aside>
  `,
})
export class RightSidebarComponent implements OnInit {
  private readonly postService = inject(PostService);

  protected readonly posts = signal<
    { id: string; slug: string; title: string; commentsCount: number }[]
  >([]);
  protected readonly loading = signal<boolean>(false);

  private loaded = false;

  async ngOnInit(): Promise<void> {
    if (this.loaded) {
      return;
    }

    this.loaded = true;
    this.loading.set(true);

    try {
      const posts = await this.postService.fetchMostDiscussedPosts(DISCUSSION_LIMIT);
      this.posts.set(
        posts.map((post) => ({
          id: post.id,
          slug: post.slug,
          title: post.title,
          commentsCount: post.commentsCount,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
