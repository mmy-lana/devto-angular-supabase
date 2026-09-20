import { inject, Injectable, signal } from '@angular/core';
import {
  mapPostDetailRow,
  mapPostSummaryRow,
  type CreatePostPayload,
  type FeedFilter,
  type PostDetail,
  type PostDetailRow,
  type PostSummary,
  type PostSummaryRow,
  type UpdatePostPayload,
} from '../models/post.model';
import {
  createEmptyUserReactions,
  type ReactionType,
  type UserReactionsState,
} from '../models/reaction.model';
import { toErrorMessage } from '../utils/error-message.util';
import { AuthService } from './auth.service';
import { MarkdownService } from './markdown.service';
import { SupabaseService } from './supabase.service';

/** Embed and column set shared by the feed and detail queries. */
const POST_PROJECTION = `
  id,
  author_id,
  title,
  slug,
  cover_image_url,
  reading_time_minutes,
  published,
  reactions_count,
  comments_count,
  created_at,
  updated_at,
  profiles!posts_author_id_fkey (*),
  post_tags (
    tags (*)
  )
`;

/** Postgres unique-violation code, raised when a slug is already taken. */
const UNIQUE_VIOLATION = '23505';

/** Number of slug attempts before giving up. */
const MAX_SLUG_ATTEMPTS = 3;

/** Keyset cursor for stable pagination across both sort strategies. */
interface FeedCursor {
  lastCreatedAt: string;
  lastReactionsCount: number;
  lastId: string;
}

/** Start of the `top` time window, or `null` when unbounded. */
function timeRangeStart(range: FeedFilter['timeRange']): string | null {
  if (!range || range === 'infinity') {
    return null;
  }

  const hours: Record<'day' | 'week' | 'month' | 'year', number> = {
    day: 24,
    week: 24 * 7,
    month: 24 * 30,
    year: 24 * 365,
  };

  return new Date(Date.now() - hours[range] * 3_600_000).toISOString();
}

/** Removes characters that would break PostgREST filter syntax. */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Quotes a value for use inside a PostgREST `or` expression. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}

/**
 * Post queries and feed state.
 *
 * Feed paging uses a keyset cursor rather than `offset`, so inserting a post
 * while the reader scrolls can never duplicate or skip a card. `sort: 'latest'`
 * pages on `created_at`, every other sort pages on the
 * `(reactions_count, created_at, id)` triplet with the matching tuple
 * comparison expressed as a PostgREST `or` filter.
 */
@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);
  private readonly markdownService = inject(MarkdownService);

  readonly postsSignal = signal<PostSummary[]>([]);
  readonly loadingSignal = signal<boolean>(false);
  readonly errorSignal = signal<string>('');
  /** `true` when the last full page suggests more posts are available. */
  readonly hasMoreSignal = signal<boolean>(false);

  private cursorState: FeedCursor | null = null;

  /**
   * Loads a page of the feed into `postsSignal`.
   *
   * Page 1 (and any explicit `resetCursor`) starts a fresh list; later pages are
   * appended. Fetch failures are recorded in `errorSignal` and returned as an
   * empty list instead of throwing, because the feed is rendered from the signal
   * and must stay usable while offline.
   */
  async fetchFeed(filter: FeedFilter, resetCursor = false): Promise<PostSummary[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

    try {
      if (resetCursor || filter.page <= 1) {
        this.cursorState = null;
      }

      const tagPostIds = filter.tag ? await this.fetchPostIdsForTag(filter.tag) : null;

      if (tagPostIds !== null && tagPostIds.length === 0) {
        if (filter.page <= 1) {
          this.postsSignal.set([]);
        }
        this.hasMoreSignal.set(false);

        return [];
      }

      let query = this.supabase
        .from('posts')
        .select(POST_PROJECTION)
        .eq('published', true);

      if (tagPostIds !== null) {
        query = query.in('id', tagPostIds);
      }

      const windowStart = filter.sort === 'top' ? timeRangeStart(filter.timeRange) : null;

      if (windowStart) {
        query = query.gte('created_at', windowStart);
      }

      const searchTerm = sanitizeSearchTerm(filter.searchQuery ?? '');

      if (searchTerm.length > 0) {
        query = query.or(`title.ilike.%${searchTerm}%,content_markdown.ilike.%${searchTerm}%`);
      }

      if (filter.sort === 'latest') {
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

        if (this.cursorState) {
          query = query.lt('created_at', this.cursorState.lastCreatedAt);
        }
      } else {
        query = query
          .order('reactions_count', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });

        if (this.cursorState) {
          const { lastReactionsCount, lastCreatedAt, lastId } = this.cursorState;
          const created = quoteFilterValue(lastCreatedAt);

          query = query.or(
            [
              `reactions_count.lt.${lastReactionsCount}`,
              `and(reactions_count.eq.${lastReactionsCount},created_at.lt.${created})`,
              `and(reactions_count.eq.${lastReactionsCount},created_at.eq.${created},id.lt.${lastId})`,
            ].join(','),
          );
        }
      }

      const pageSize = Math.max(1, filter.pageSize);

      // One extra row tells us whether another page exists without a count query.
      query = query.limit(pageSize + 1);

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as PostSummaryRow[];
      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

      if (pageRows.length > 0) {
        const last = pageRows[pageRows.length - 1];
        this.cursorState = {
          lastCreatedAt: last.created_at,
          lastReactionsCount: last.reactions_count,
          lastId: last.id,
        };
      }

      const currentUserId = this.authService.currentUser()?.id;
      const userReactions = currentUserId
        ? await this.fetchUserReactionsForPosts(
            pageRows.map((row) => row.id),
            currentUserId,
          )
        : new Map<string, UserReactionsState>();

      const mapped = pageRows.map((row) =>
        mapPostSummaryRow(row, userReactions.get(row.id) ?? createEmptyUserReactions()),
      );

      this.postsSignal.update((previous) =>
        filter.page <= 1 ? mapped : dedupeById([...previous, ...mapped]),
      );
      this.hasMoreSignal.set(hasMore);

      return mapped;
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not load posts. Pull to refresh to retry.'));

      return [];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Clears the feed and its cursor, e.g. when leaving the feed page. */
  reset(): void {
    this.postsSignal.set([]);
    this.errorSignal.set('');
    this.hasMoreSignal.set(false);
    this.cursorState = null;
  }

  /** Loads one post with its rendered body, or `null` when the slug is unknown. */
  async getPostBySlug(slug: string): Promise<PostDetail | null> {
    this.errorSignal.set('');

    try {
      const { data, error } = await this.supabase
        .from('posts')
        .select(`${POST_PROJECTION}, content_markdown, content_html`)
        .eq('slug', slug)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      const row = data as unknown as PostDetailRow;
      const currentUserId = this.authService.currentUser()?.id;
      const userReactions = currentUserId
        ? (await this.fetchUserReactionsForPosts([row.id], currentUserId)).get(row.id)
        : undefined;

      return mapPostDetailRow(row, userReactions ?? createEmptyUserReactions());
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not load this post.'));

      return null;
    }
  }

  /**
   * Publishes a post and returns its slug.
   *
   * Slugs are salted with random characters, so a collision is unlikely; the
   * insert is still retried on a unique violation instead of failing the
   * author's publish action.
   */
  async createPost(payload: CreatePostPayload): Promise<string> {
    const user = this.authService.currentUser();

    if (!user) {
      throw new Error('Sign in to publish a post.');
    }

    const title = payload.title.trim();

    if (title.length < 5) {
      throw new Error('Titles need at least 5 characters.');
    }

    if (payload.contentMarkdown.trim().length === 0) {
      throw new Error('Write some content before publishing.');
    }

    const contentHtml = this.markdownService.parseMarkdownToHtml(payload.contentMarkdown);
    const readingTime = this.markdownService.calculateReadingTime(payload.contentMarkdown);

    let created: { id: string; slug: string } | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !created; attempt += 1) {
      const { data, error } = await this.supabase
        .from('posts')
        .insert({
          author_id: user.id,
          title,
          slug: this.markdownService.generateSlug(title),
          content_markdown: payload.contentMarkdown,
          content_html: contentHtml,
          cover_image_url: payload.coverImageUrl?.trim() ? payload.coverImageUrl.trim() : null,
          reading_time_minutes: readingTime,
          published: payload.published,
        })
        .select('id, slug')
        .single();

      if (!error && data) {
        created = data as { id: string; slug: string };
        continue;
      }

      if (error && error.code === UNIQUE_VIOLATION) {
        lastError = error;
        continue;
      }

      throw new Error(toErrorMessage(error, 'Could not publish your post.'));
    }

    if (!created) {
      throw new Error(
        toErrorMessage(lastError, 'Could not generate a unique link for this post. Try another title.'),
      );
    }

    const tagIds = payload.tagIds.filter((tagId) => tagId.length > 0);

    if (tagIds.length > 0) {
      const { error: tagError } = await this.supabase
        .from('post_tags')
        .insert(tagIds.map((tagId) => ({ post_id: created.id, tag_id: tagId })));

      if (tagError) {
        throw new Error(
          toErrorMessage(tagError, 'The post was saved, but its tags could not be attached.'),
        );
      }
    }

    return created.slug;
  }

  /** Updates a post; omitted fields keep their stored value. */
  async updatePost(postId: string, payload: UpdatePostPayload): Promise<void> {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (payload.title !== undefined) {
      updates['title'] = payload.title.trim();
    }

    if (payload.contentMarkdown !== undefined) {
      updates['content_markdown'] = payload.contentMarkdown;
      updates['content_html'] = this.markdownService.parseMarkdownToHtml(payload.contentMarkdown);
      updates['reading_time_minutes'] = this.markdownService.calculateReadingTime(
        payload.contentMarkdown,
      );
    }

    if (payload.coverImageUrl !== undefined) {
      updates['cover_image_url'] = payload.coverImageUrl?.trim() ? payload.coverImageUrl.trim() : null;
    }

    if (payload.published !== undefined) {
      updates['published'] = payload.published;
    }

    const { error } = await this.supabase.from('posts').update(updates).eq('id', postId);

    if (error) {
      throw new Error(toErrorMessage(error, 'Could not save your changes.'));
    }

    if (payload.tagIds) {
      await this.replacePostTags(postId, payload.tagIds);
    }
  }

  /** Deletes a post and removes it from the feed signal. */
  async deletePost(postId: string): Promise<void> {
    const { error } = await this.supabase.from('posts').delete().eq('id', postId);

    if (error) {
      throw new Error(toErrorMessage(error, 'Could not delete this post.'));
    }

    this.postsSignal.update((posts) => posts.filter((post) => post.id !== postId));
  }

  /** Most discussed posts, used by the sidebar's `#discuss` box. */
  async fetchMostDiscussedPosts(limit = 3): Promise<PostSummary[]> {
    try {
      const { data, error } = await this.supabase
        .from('posts')
        .select(POST_PROJECTION)
        .eq('published', true)
        .gt('comments_count', 0)
        .order('comments_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as PostSummaryRow[];
      const currentUserId = this.authService.currentUser()?.id;
      const userReactions = currentUserId
        ? await this.fetchUserReactionsForPosts(
            rows.map((row) => row.id),
            currentUserId,
          )
        : new Map<string, UserReactionsState>();

      return rows.map((row) =>
        mapPostSummaryRow(row, userReactions.get(row.id) ?? createEmptyUserReactions()),
      );
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not load discussions.'));

      return [];
    }
  }

  /** Applies an optimistic reaction toggle to one post already in the feed. */
  applyReactionToFeed(postId: string, reaction: ReactionType, nextState: boolean): void {
    this.postsSignal.update((posts) =>
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              reactionsCount: Math.max(0, post.reactionsCount + (nextState ? 1 : -1)),
              userReactions: { ...post.userReactions, [reaction]: nextState },
            }
          : post,
      ),
    );
  }

  /** Restores the pre-toggle reaction state of one feed post. */
  restoreFeedReaction(postId: string, reaction: ReactionType, previousState: boolean): void {
    this.applyReactionToFeed(postId, reaction, previousState);
  }

  /** Post ids carrying a tag, resolved before the feed query. */
  private async fetchPostIdsForTag(tagName: string): Promise<string[]> {
    const { data: tagRow, error: tagError } = await this.supabase
      .from('tags')
      .select('id')
      .eq('name', tagName)
      .maybeSingle();

    if (tagError) {
      throw tagError;
    }

    if (!tagRow) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('post_tags')
      .select('post_id')
      .eq('tag_id', (tagRow as { id: string }).id);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => (row as { post_id: string }).post_id);
  }

  /** Replaces the tag links of a post with the supplied ids. */
  private async replacePostTags(postId: string, tagIds: string[]): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from('post_tags')
      .delete()
      .eq('post_id', postId);

    if (deleteError) {
      throw new Error(toErrorMessage(deleteError, 'Could not update the post tags.'));
    }

    const uniqueTagIds = [...new Set(tagIds.filter((tagId) => tagId.length > 0))];

    if (uniqueTagIds.length === 0) {
      return;
    }

    const { error: insertError } = await this.supabase
      .from('post_tags')
      .insert(uniqueTagIds.map((tagId) => ({ post_id: postId, tag_id: tagId })));

    if (insertError) {
      throw new Error(toErrorMessage(insertError, 'Could not update the post tags.'));
    }
  }

  /** Which of the given posts the visitor has already reacted to. */
  private async fetchUserReactionsForPosts(
    postIds: string[],
    userId: string,
  ): Promise<Map<string, UserReactionsState>> {
    const reactionMap = new Map<string, UserReactionsState>();

    for (const postId of postIds) {
      reactionMap.set(postId, createEmptyUserReactions());
    }

    if (postIds.length === 0) {
      return reactionMap;
    }

    const { data, error } = await this.supabase
      .from('reactions')
      .select('post_id, reaction')
      .eq('user_id', userId)
      .in('post_id', postIds);

    if (error || !data) {
      return reactionMap;
    }

    for (const row of data as { post_id: string | null; reaction: ReactionType }[]) {
      const state = row.post_id ? reactionMap.get(row.post_id) : undefined;

      if (state && row.reaction in state) {
        state[row.reaction] = true;
      }
    }

    return reactionMap;
  }
}

/** Keeps the newest copy of each post when pages overlap. */
function dedupeById(posts: PostSummary[]): PostSummary[] {
  const byId = new Map<string, PostSummary>();

  for (const post of posts) {
    byId.set(post.id, post);
  }

  return [...byId.values()];
}
