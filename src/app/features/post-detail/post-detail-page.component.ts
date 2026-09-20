import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { PostDetail } from '../../core/models/post.model';
import {
  createEmptyReactionCounts,
  createEmptyUserReactions,
  type ReactionCountSummary,
  type ReactionType,
  type UserReactionsState,
} from '../../core/models/reaction.model';
import { AuthService } from '../../core/services/auth.service';
import { CommentService } from '../../core/services/comment.service';
import { PostService } from '../../core/services/post.service';
import { ReactionService } from '../../core/services/reaction.service';
import { formatShortDate } from '../../core/utils/date.util';
import { AuthorHeaderComponent } from '../../shared/molecules/author-header/author-header.component';
import { TagPillComponent } from '../../shared/molecules/tag-pill/tag-pill.component';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { DetailSkeletonComponent } from '../../shared/ui/skeleton/detail-skeleton.component';
import { CommentComposerComponent } from '../comments/comment-composer.component';
import { CommentTreeComponent } from '../comments/comment-tree.component';
import { ReactionFloatingBarComponent } from './components/reaction-floating-bar.component';

/**
 * Article view: cover, body, author box, reaction rail and the discussion.
 *
 * The post, its per-kind reaction counters and the comment tree are loaded in
 * parallel. Reactions and comment likes are optimistic — the rail and the tree
 * update on the same frame and roll back with an inline error if the write is
 * rejected. An unknown slug renders a not-found state instead of an empty page.
 */
@Component({
  selector: 'app-post-detail-page',
  imports: [
    RouterLink,
    AuthorHeaderComponent,
    TagPillComponent,
    ReactionFloatingBarComponent,
    CommentComposerComponent,
    CommentTreeComponent,
    AvatarComponent,
    ButtonComponent,
    DetailSkeletonComponent,
  ],
  template: `
    @if (isLoading()) {
      <app-detail-skeleton />
    } @else if (post(); as p) {
      <div class="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-1">
            <app-reaction-floating-bar
              [reactions]="userReactions()"
              [likesCount]="reactionCounts().like"
              [unicornsCount]="reactionCounts().unicorn"
              [bookmarksCount]="reactionCounts().bookmark"
              [commentsCount]="commentService.totalCount()"
              (reactionClicked)="onReaction($event)"
              (commentsJump)="jumpToComments()"
            />
          </div>

          <article class="col-span-1 lg:col-span-8 bg-white border border-[#d4d4d4] rounded-md overflow-hidden shadow-sm">
            @if (p.coverImageUrl) {
              <div class="w-full h-48 sm:h-80 overflow-hidden bg-gray-100">
                <img [src]="p.coverImageUrl" [alt]="p.title" class="w-full h-full object-cover" />
              </div>
            }

            <div class="p-4 sm:p-8 lg:p-10">
              <div class="mb-4">
                <app-author-header [author]="p.author" [publishedAt]="p.createdAt" />
              </div>

              <h1 class="text-2xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
                {{ p.title }}
              </h1>

              @if (p.tags.length > 0) {
                <div class="flex flex-wrap gap-1 mb-4">
                  @for (tag of p.tags; track tag.id) {
                    <app-tag-pill [tag]="tag" [selectable]="true" />
                  }
                </div>
              }

              <p class="text-xs text-gray-500 mb-6">
                {{ p.readingTimeMinutes }} min read &bull; published {{ publishedLabel() }}
              </p>

              @if (reactionError(); as error) {
                <p role="alert" class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {{ error }}
                </p>
              }

              <div class="devto-prose text-gray-800" [innerHTML]="p.contentHtml"></div>

              <section id="comments-section" class="mt-12 pt-8 border-t border-[#e2e8f0]">
                <h2 class="text-xl font-bold text-gray-900 mb-6">
                  Discussion ({{ commentService.totalCount() }})
                </h2>

                <div class="mb-8">
                  <app-comment-composer [postId]="p.id" (commentCreated)="onCommentCreated()" />
                </div>

                @if (commentService.errorSignal(); as error) {
                  <div
                    role="alert"
                    class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 mb-4"
                  >
                    <p class="text-sm text-red-800">{{ error }}</p>
                    <app-button variant="danger" size="sm" (clicked)="reloadComments(p.id)">
                      Retry
                    </app-button>
                  </div>
                }

                @if (commentService.loadingSignal() && commentService.commentsTreeSignal().length === 0) {
                  <p class="text-sm text-gray-500 py-4 text-center" role="status">
                    Loading the discussion…
                  </p>
                } @else {
                  <app-comment-tree
                    [comments]="commentService.commentsTreeSignal()"
                    [currentUserId]="currentUserId()"
                    (likeToggled)="onCommentLike($event)"
                    (deleteRequested)="onCommentDelete($event)"
                    (replyCreated)="onCommentCreated()"
                  />
                }
              </section>
            </div>
          </article>

          <aside class="hidden lg:block lg:col-span-3 space-y-4">
            <div class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
              <div class="h-8 bg-[#3b49df] -mx-4 -mt-4 rounded-t-md mb-3"></div>
              <div class="flex items-center space-x-3 -mt-6 mb-3">
                <app-avatar
                  [src]="p.author.avatarUrl"
                  [alt]="p.author.fullName"
                  [fallbackSeed]="p.author.username"
                  size="lg"
                />
                <div class="min-w-0">
                  <h2 class="font-bold text-gray-900 leading-tight truncate">
                    {{ p.author.fullName }}
                  </h2>
                  <p class="text-xs text-gray-500 font-mono truncate">&#64;{{ p.author.username }}</p>
                </div>
              </div>

              <p class="text-xs text-gray-600 mb-4">
                {{ p.author.bio || 'Developer writing on the DEV Community.' }}
              </p>

              <dl class="text-xs text-gray-500 space-y-1">
                <div class="flex justify-between gap-2">
                  <dt class="font-semibold text-gray-800">Joined</dt>
                  <dd>{{ joinedLabel() }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="font-semibold text-gray-800">Reactions</dt>
                  <dd>{{ p.reactionsCount }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="font-semibold text-gray-800">Comments</dt>
                  <dd>{{ p.commentsCount }}</dd>
                </div>
              </dl>

              @if (p.author.websiteUrl) {
                <a
                  [href]="p.author.websiteUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-4 inline-block text-xs font-medium text-[#3b49df] hover:underline"
                >
                  Visit website
                </a>
              }
            </div>
          </aside>
        </div>
      </div>
    } @else {
      <div class="max-w-3xl mx-auto px-4 py-16 text-center">
        <p class="text-2xl font-bold text-gray-900 mb-2">{{ unavailableTitle() }}</p>
        <p class="text-sm text-gray-500 mb-6">{{ unavailableHint() }}</p>
        <div class="flex flex-wrap items-center justify-center gap-2">
          @if (loadError()) {
            <app-button variant="secondary" size="md" (clicked)="retryLoad()">Try again</app-button>
          }
          <a routerLink="/">
            <app-button variant="primary" size="md">Back to the feed</app-button>
          </a>
        </div>
      </div>
    }
  `,
})
export class PostDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly postService = inject(PostService);
  protected readonly commentService = inject(CommentService);
  private readonly reactionService = inject(ReactionService);
  private readonly authService = inject(AuthService);

  protected readonly post = signal<PostDetail | null>(null);
  protected readonly isLoading = signal<boolean>(true);
  protected readonly loadError = signal<string>('');
  protected readonly reactionError = this.reactionService.errorSignal;

  protected readonly userReactions = signal<UserReactionsState>(createEmptyUserReactions());
  protected readonly reactionCounts = signal<ReactionCountSummary>(createEmptyReactionCounts());

  protected readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);

  protected readonly publishedLabel = computed(() => {
    const detail = this.post();

    return detail ? formatShortDate(detail.createdAt) : '';
  });

  /** Distinguishes a missing post from a failed request. */
  protected readonly unavailableTitle = computed(() =>
    this.loadError() ? "We couldn't load this post" : 'Post not found',
  );

  protected readonly unavailableHint = computed(
    () => this.loadError() || 'This post may have been unpublished, or the link is incomplete.',
  );

  protected readonly joinedLabel = computed(() => {
    const detail = this.post();

    return detail ? formatShortDate(detail.author.createdAt) : '';
  });

  constructor() {
    void this.loadPost();
  }

  protected async retryLoad(): Promise<void> {
    await this.loadPost();
  }

  protected async reloadComments(postId: string): Promise<void> {
    await this.commentService.loadCommentsForPost(postId);
  }

  protected async onCommentCreated(): Promise<void> {
    const detail = this.post();

    if (!detail) {
      return;
    }

    // The insert already patched the tree; refreshing the counter keeps the
    // "Discussion (n)" heading and the reaction rail in step with the database.
    this.post.update((current) =>
      current ? { ...current, commentsCount: this.commentService.totalCount() } : current,
    );
  }

  protected async onCommentLike(commentId: string): Promise<void> {
    const state = this.commentService.getCommentLikeState(commentId);

    if (!state) {
      return;
    }

    await this.reactionService.toggleCommentReaction(
      commentId,
      state.hasLiked,
      state.likesCount,
      (updater) => this.commentService.applyCommentReaction(commentId, updater),
    );
  }

  protected async onCommentDelete(commentId: string): Promise<void> {
    await this.commentService.deleteComment(commentId);
    this.post.update((current) =>
      current ? { ...current, commentsCount: this.commentService.totalCount() } : current,
    );
  }

  protected async onReaction(type: ReactionType): Promise<void> {
    const detail = this.post();

    if (!detail) {
      return;
    }

    await this.reactionService.togglePostReaction(
      detail.id,
      type,
      this.userReactions()[type],
      this.reactionCounts(),
      (updater) => this.userReactions.update(updater),
      (updater) => this.reactionCounts.update(updater),
    );
  }

  protected jumpToComments(): void {
    document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private async loadPost(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug');

    this.isLoading.set(true);
    this.loadError.set('');
    this.postService.errorSignal.set('');

    if (!slug) {
      this.isLoading.set(false);
      this.loadError.set('The post link is incomplete.');

      return;
    }

    try {
      const detail = await this.postService.getPostBySlug(slug);

      if (!detail) {
        this.post.set(null);
        this.loadError.set(this.postService.errorSignal());

        return;
      }

      this.post.set(detail);
      this.userReactions.set(detail.userReactions);

      const counts = await this.reactionService.fetchReactionCountsForPost(
        detail.id,
        detail.reactionsCount,
      );
      this.reactionCounts.set(counts);

      this.commentService.reset();
      await this.commentService.loadCommentsForPost(detail.id);
    } finally {
      this.isLoading.set(false);
    }
  }
}
