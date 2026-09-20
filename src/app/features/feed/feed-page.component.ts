import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import type { FeedSortCriteria, FeedTimeRange } from '../../core/models/post.model';
import {
  createEmptyReactionCounts,
  type ReactionType,
  type UserReactionsState,
} from '../../core/models/reaction.model';
import { AuthService } from '../../core/services/auth.service';
import { PostService } from '../../core/services/post.service';
import { ReactionService } from '../../core/services/reaction.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardSkeletonComponent } from '../../shared/ui/skeleton/card-skeleton.component';
import { FeedTabsComponent } from './components/feed-tabs.component';
import { LeftSidebarComponent } from './components/left-sidebar.component';
import { PostCardComponent } from './components/post-card.component';
import { RightSidebarComponent } from './components/right-sidebar.component';

/** Feed request size: the plan's 15 cards per page. */
const FEED_PAGE_SIZE = 15;

/** Filters that fully describe a feed request, derived from the URL. */
interface FeedUrlFilters {
  sort: FeedSortCriteria;
  timeRange: FeedTimeRange;
  tag: string;
  searchQuery: string;
}

/**
 * Feed page: three responsive columns, sort tabs, keyset paging and the complete
 * set of list states (skeleton, empty, filtered-empty, signed-out and error).
 *
 * Every filter lives in the URL (`?sort=&t=&tag=&q=`) so a search or a tag view
 * can be shared and survives a refresh. `/bookmarks` reuses this page with
 * `data.readingList`, filtering server-side by the posts the visitor bookmarked.
 */
@Component({
  selector: 'app-feed-page',
  imports: [
    FeedTabsComponent,
    PostCardComponent,
    LeftSidebarComponent,
    RightSidebarComponent,
    CardSkeletonComponent,
    ButtonComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
      <div class="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
        <div class="hidden md:block md:col-span-3">
          <app-left-sidebar />
        </div>

        <div class="col-span-1 md:col-span-9 lg:col-span-6">
          @if (isReadingList()) {
            <div class="mb-4">
              <h1 class="text-xl font-bold text-gray-900">Reading List</h1>
              <p class="text-xs text-gray-500">
                Posts you bookmarked. Bookmarks are stored with your account.
              </p>
            </div>
          } @else {
            <app-feed-tabs
              [currentSort]="sort()"
              [currentTimeRange]="timeRange()"
              (sortChange)="onSortChange($event)"
              (timeRangeChange)="onTimeRangeChange($event)"
            />
          }

          @if (!needsSignIn()) {
            @if (activeTag() || searchQuery()) {
              <div class="flex flex-wrap items-center gap-2 mb-3">
                @if (activeTag(); as tag) {
                  <span
                    class="inline-flex items-center gap-1 rounded-md border border-[#d4d4d4] bg-white px-2 py-1 text-xs font-mono"
                  >
                    #{{ tag }}
                    <button
                      type="button"
                      class="font-bold text-gray-500 hover:text-red-600"
                      [attr.aria-label]="'Clear the ' + tag + ' tag filter'"
                      (click)="clearTag()"
                    >
                      &times;
                    </button>
                  </span>
                }

                @if (searchQuery(); as query) {
                  <span
                    class="inline-flex items-center gap-1 rounded-md border border-[#d4d4d4] bg-white px-2 py-1 text-xs"
                  >
                    Search: “{{ query }}”
                    <button
                      type="button"
                      class="font-bold text-gray-500 hover:text-red-600"
                      aria-label="Clear the search filter"
                      (click)="clearSearch()"
                    >
                      &times;
                    </button>
                  </span>
                }
              </div>
            }

            @if (errorMessage(); as error) {
              <div
                role="alert"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 mb-3"
              >
                <p class="text-sm text-red-800">{{ error }}</p>
                <app-button variant="danger" size="sm" (clicked)="reload()">Try again</app-button>
              </div>
            }

            @if (isLoadingFirstPage()) {
              <app-card-skeleton />
              <app-card-skeleton />
              <app-card-skeleton />
            } @else {
              @for (post of posts(); track post.id; let first = $first) {
                <app-post-card
                  [post]="post"
                  [showCoverImage]="first && !isReadingList()"
                  (bookmarkToggled)="onBookmark($event)"
                  (reactionToggled)="onReaction($event, post.id)"
                  (tagSelected)="onTagSelected($event.name)"
                />
              } @empty {
                <div class="bg-white border border-[#d4d4d4] rounded-md p-8 text-center">
                  <p class="text-gray-700 font-medium mb-1">{{ emptyTitle() }}</p>
                  <p class="text-xs text-gray-500 mb-4">{{ emptyHint() }}</p>

                  @if (activeTag() || searchQuery()) {
                    <app-button variant="secondary" size="sm" (clicked)="clearFilters()">
                      Clear filters
                    </app-button>
                  } @else if (!isReadingList() && sort() !== 'latest') {
                    <app-button variant="secondary" size="sm" (clicked)="switchToLatest()">
                      Show latest posts
                    </app-button>
                  }
                </div>
              }

              @if (posts().length > 0 && hasMore()) {
                <div class="flex justify-center py-2">
                  <app-button
                    variant="secondary"
                    size="md"
                    [loading]="isLoadingMore()"
                    (clicked)="loadMore()"
                  >
                    Load more posts
                  </app-button>
                </div>
              }
            }
          } @else {
            <div class="bg-white border border-[#d4d4d4] rounded-md p-8 text-center">
              <p class="text-gray-700 font-medium mb-1">Your reading list needs an account</p>
              <p class="text-xs text-gray-500 mb-4">
                Sign in to bookmark posts and find them here later.
              </p>
              <app-button variant="primary" size="sm" (clicked)="authService.openAuthModal()">
                Sign in
              </app-button>
            </div>
          }
        </div>

        <div class="hidden lg:block lg:col-span-3">
          <app-right-sidebar />
        </div>
      </div>
    </div>
  `,
})
export class FeedPageComponent {
  protected readonly authService = inject(AuthService);
  private readonly postService = inject(PostService);
  private readonly reactionService = inject(ReactionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly posts = this.postService.postsSignal;
  protected readonly errorMessage = this.postService.errorSignal;
  protected readonly hasMore = this.postService.hasMoreSignal;

  protected readonly sort = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => (params.get('sort') as FeedSortCriteria | null) ?? 'relevant'),
      distinctUntilChanged(),
    ),
    { initialValue: 'relevant' as FeedSortCriteria },
  );

  protected readonly timeRange = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => (params.get('t') as FeedTimeRange | null) ?? 'week'),
      distinctUntilChanged(),
    ),
    { initialValue: 'week' as FeedTimeRange },
  );

  protected readonly activeTag = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get('tag') ?? ''),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  protected readonly searchQuery = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get('q') ?? ''),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  protected readonly isReadingList = toSignal(
    this.route.data.pipe(map((data) => data['readingList'] === true)),
    { initialValue: false },
  );

  /** Reading lists are per account, so anonymous visitors get a prompt instead. */
  protected readonly needsSignIn = computed(
    () => this.isReadingList() && !this.authService.isAuthenticated(),
  );

  protected readonly isLoadingFirstPage = computed(
    () => this.postService.loadingSignal() && !this.loadedOnce(),
  );

  protected readonly isLoadingMore = computed(
    () => this.postService.loadingSignal() && this.loadedOnce(),
  );

  protected readonly emptyTitle = computed(() => {
    if (this.isReadingList()) {
      return 'Your reading list is empty.';
    }

    if (this.activeTag() || this.searchQuery()) {
      return 'No posts match these filters.';
    }

    return 'No posts found in this feed view.';
  });

  protected readonly emptyHint = computed(() => {
    if (this.isReadingList()) {
      return 'Bookmark a post from the feed and it will show up here.';
    }

    if (this.activeTag()) {
      return `Nothing has been published under #${this.activeTag()} yet.`;
    }

    if (this.searchQuery()) {
      return `No title or body matched “${this.searchQuery()}”.`;
    }

    return 'Posts appear here as soon as someone publishes. Try the Latest tab.';
  });

  private readonly page = signal<number>(1);
  private readonly loadedOnce = signal<boolean>(false);

  constructor() {
    // The URL is the single source of truth for filters: the initial load and
    // every later change (sort tab, tag click, header search) flow through here.
    this.route.queryParamMap
      .pipe(
        map(
          (params): FeedUrlFilters => ({
            sort: (params.get('sort') as FeedSortCriteria | null) ?? 'relevant',
            timeRange: (params.get('t') as FeedTimeRange | null) ?? 'week',
            tag: params.get('tag') ?? '',
            searchQuery: params.get('q') ?? '',
          }),
        ),
        distinctUntilChanged(
          (previous, next) =>
            previous.sort === next.sort &&
            previous.timeRange === next.timeRange &&
            previous.tag === next.tag &&
            previous.searchQuery === next.searchQuery,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((filters) => {
        void this.load(1, true, filters);
      });
  }

  protected async loadMore(): Promise<void> {
    await this.load(this.page() + 1, false);
  }

  protected async reload(): Promise<void> {
    await this.load(1, true);
  }

  protected onSortChange(sort: FeedSortCriteria): void {
    void this.updateQueryParams({ sort });
  }

  protected onTimeRangeChange(timeRange: FeedTimeRange): void {
    void this.updateQueryParams({ t: timeRange });
  }

  protected onTagSelected(tagName: string): void {
    void this.updateQueryParams({ tag: tagName, sort: null });
  }

  protected clearTag(): void {
    void this.updateQueryParams({ tag: null });
  }

  protected clearSearch(): void {
    void this.updateQueryParams({ q: null });
  }

  protected clearFilters(): void {
    void this.updateQueryParams({ tag: null, q: null });
  }

  protected switchToLatest(): void {
    void this.updateQueryParams({ sort: 'latest' });
  }

  /** Optimistically toggles a bookmark on a card and rolls back if it fails. */
  protected async onBookmark(postId: string): Promise<void> {
    const post = this.posts().find((candidate) => candidate.id === postId);

    if (!post) {
      return;
    }

    const isBookmarked = post.userReactions.bookmark;
    const currentCounts = {
      ...createEmptyReactionCounts(),
      bookmark: isBookmarked ? 1 : 0,
      total: post.reactionsCount,
    };

    await this.reactionService.togglePostReaction(
      postId,
      'bookmark',
      isBookmarked,
      currentCounts,
      (updater) => this.patchUserReactions(postId, updater),
      (updater) => this.patchReactionCount(postId, updater(currentCounts).total),
    );
  }

  /** Optimistically toggles a card reaction (the heart) and rolls back on failure. */
  protected async onReaction(reaction: ReactionType, postId: string): Promise<void> {
    const post = this.posts().find((candidate) => candidate.id === postId);

    if (!post) {
      return;
    }

    const currentCounts = {
      ...createEmptyReactionCounts(),
      [reaction]: post.reactionsCount,
      total: post.reactionsCount,
    };

    await this.reactionService.togglePostReaction(
      postId,
      reaction,
      post.userReactions[reaction],
      currentCounts,
      (updater) => this.patchUserReactions(postId, updater),
      (updater) => this.patchReactionCount(postId, updater(currentCounts).total),
    );
  }

  private async updateQueryParams(params: Record<string, string | null>): Promise<void> {
    await this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  private patchUserReactions(
    postId: string,
    updater: (previous: UserReactionsState) => UserReactionsState,
  ): void {
    this.postService.postsSignal.update((posts) =>
      posts.map((post) =>
        post.id === postId ? { ...post, userReactions: updater(post.userReactions) } : post,
      ),
    );
  }

  private patchReactionCount(postId: string, total: number): void {
    this.postService.postsSignal.update((posts) =>
      posts.map((post) => (post.id === postId ? { ...post, reactionsCount: total } : post)),
    );
  }

  private async load(page: number, resetCursor: boolean, override?: FeedUrlFilters): Promise<void> {
    const filters: FeedUrlFilters = override ?? {
      sort: this.sort(),
      timeRange: this.timeRange(),
      tag: this.activeTag(),
      searchQuery: this.searchQuery(),
    };

    this.page.set(page);

    if (this.needsSignIn()) {
      this.postService.reset();
      this.loadedOnce.set(true);

      return;
    }

    await this.postService.fetchFeed(
      {
        sort: filters.sort,
        timeRange: filters.timeRange,
        tag: filters.tag.length > 0 ? filters.tag : undefined,
        searchQuery: filters.searchQuery.length > 0 ? filters.searchQuery : undefined,
        bookmarkedOnly: this.isReadingList(),
        page,
        pageSize: FEED_PAGE_SIZE,
      },
      resetCursor,
    );

    this.loadedOnce.set(true);
  }
}
