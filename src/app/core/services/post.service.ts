import { inject, Injectable, signal } from '@angular/core';
import { findMockPostBySlug, MOCK_POSTS } from '../mocks/devto-mock-data';
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

/** Columns every feed and detail query returns. */
const POST_COLUMNS = `
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
  updated_at
`;

/** Author embed, shared by the feed and detail queries. */
const POST_AUTHOR_EMBED = 'profiles!posts_author_id_fkey (*)';

/** Tag embed used by the unfiltered feed and by the post detail query. */
const POST_TAG_EMBED = 'post_tags ( tags (*) )';

/** Embed and column set shared by the feed and detail queries. */
const POST_PROJECTION = `${POST_COLUMNS}, ${POST_AUTHOR_EMBED}, ${POST_TAG_EMBED}`;

/**
 * Feed projection for a tag-filtered feed (QUERY-01 / ARCH-01).
 *
 * `filter_tag:post_tags!inner(tag_id)` inner-joins the junction table so
 * Postgres filters posts by tag id in a single query without nested dot-path
 * syntax errors, while `post_tags` embeds the complete tag list for the card.
 */
const TAG_FILTERED_POST_PROJECTION =
  `${POST_COLUMNS}, ${POST_AUTHOR_EMBED}, ${POST_TAG_EMBED}, ` +
  'filter_tag:post_tags!inner(tag_id)';

/**
 * Feed projection for the reading list (ARCH-01).
 *
 * Same inner-join technique applied to the visitor's own bookmarks, so the
 * server returns exactly the bookmarked posts instead of a list of ids that the
 * client then has to send back in an `in` filter.
 */
const BOOKMARK_FILTERED_POST_PROJECTION =
  `${POST_COLUMNS}, ${POST_AUTHOR_EMBED}, ${POST_TAG_EMBED}, ` +
  'reactions!inner (user_id, reaction)';

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

/**
 * Characters that carry meaning in a PostgREST filter expression.
 *
 * `(`, `)` and `,` delimit the `or=(...)` grammar, `"` quotes a value, `*` and
 * `%` are wildcards and `[` and `]` start a range. A term containing any of them
 * used to be interpolated straight into the query string, so an ordinary search
 * such as `Q&A (2024)` or `C# [` produced a syntax error instead of a result
 * (UI-01). They are replaced by a space rather than dropped so the term keeps
 * word boundaries.
 */
const POSTGREST_RESERVED_CHARACTERS = /[,()%*\\"[\]']/g;

/**
 * Removes characters that would break PostgREST filter syntax (QUERY-02).
 * Strips reserved punctuation, quotes, and structural delimiters.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(POSTGREST_RESERVED_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
}

/** Quotes a value for use inside a PostgREST `or` expression. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}

/**
 * Post queries and feed state.
 *
 * Feed paging uses a keyset cursor rather than `offset`, so inserting a post
 * while the reader scrolls can never duplicate or skip a card. Both sort
 * strategies page on a composite key — `(created_at, id)` for `latest` and
 * `(reactions_count, created_at, id)` otherwise — because ordering on a column
 * that is not unique lets two rows share a position and one of them be skipped
 * (DATA-02).
 *
 * Every read falls back to the bundled dataset in `core/mocks` when the remote
 * is unconfigured or unreachable, so a build without environment variables — or
 * a laptop with the Docker stack stopped — still renders a complete feed.
 */
@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly supabase = this.supabaseService.client;
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
   * appended. When the remote is unconfigured or the request fails, the same
   * filter is answered from the bundled dataset instead, so the feed renders
   * complete content rather than an empty list with an error banner.
   */
  async fetchFeed(filter: FeedFilter, resetCursor = false): Promise<PostSummary[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

    try {
      if (resetCursor || filter.page <= 1) {
        this.cursorState = null;
      }

      if (!this.supabaseService.isConfigured) {
        return this.serveLocalFeed(filter);
      }

      const currentUserId = this.authService.currentUser()?.id;

      if (filter.bookmarkedOnly && !currentUserId) {
        // The reading list is stored per account, so there is nothing to show
        // before sign-in. The page renders its signed-out state for this result.
        if (filter.page <= 1) {
          this.postsSignal.set([]);
        }

        this.hasMoreSignal.set(false);

        return [];
      }

      let tagId: string | null = null;
      if (filter.tag) {
        const { data: tagData, error: tagError } = await this.supabase
          .from('tags')
          .select('id')
          .eq('name', filter.tag)
          .maybeSingle();

        if (tagError || !tagData) {
          this.publishPage([], filter.page <= 1, false);
          return [];
        }
        tagId = (tagData as { id: string }).id;
      }

      // QUERY-01: Filter on 1-level junction embed `filter_tag.tag_id` to avoid
      // 2-level nested dot syntax (`post_tags.tags.name`) rejected by PostgREST.
      const projection = filter.tag
        ? TAG_FILTERED_POST_PROJECTION
        : filter.bookmarkedOnly
          ? BOOKMARK_FILTERED_POST_PROJECTION
          : POST_PROJECTION;

      let query = this.supabase.from('posts').select(projection).eq('published', true);

      if (filter.tag && tagId) {
        query = query.eq('filter_tag.tag_id', tagId);
      }

      if (filter.bookmarkedOnly && currentUserId) {
        query = query.eq('reactions.user_id', currentUserId).eq('reactions.reaction', 'bookmark');
      }

      const windowStart = filter.sort === 'top' ? timeRangeStart(filter.timeRange) : null;

      if (windowStart) {
        query = query.gte('created_at', windowStart);
      }

      const searchTerm = sanitizeSearchTerm(filter.searchQuery ?? '');

      if (searchTerm.length > 0) {
        // QUERY-02: Double-quote the pattern so PostgREST logic tree parser
        // treats dots (e.g. node.js) as literal values instead of field operators.
        query = query.or(
          `title.ilike."%${searchTerm}%",content_markdown.ilike."%${searchTerm}%"`,
        );
      }

      if (filter.sort === 'latest') {
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

        if (this.cursorState) {
          // DATA-02: `created_at` is not unique, so the cursor compares the full
          // composite key. Pages ordered on the timestamp alone lose every row
          // that ties with the last one of the previous page.
          const created = quoteFilterValue(this.cursorState.lastCreatedAt);
          const { lastId } = this.cursorState;

          query = query.or(
            `created_at.lt.${created},and(created_at.eq.${created},id.lt.${lastId})`,
          );
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

      const userReactions = currentUserId
        ? await this.fetchUserReactionsForPosts(
            pageRows.map((row) => row.id),
            currentUserId,
          )
        : new Map<string, UserReactionsState>();

      const mapped = pageRows.map((row) =>
        mapPostSummaryRow(row, userReactions.get(row.id) ?? createEmptyUserReactions()),
      );

      this.publishPage(mapped, filter.page <= 1, hasMore);
      this.supabaseService.markOnline();

      return mapped;
    } catch (error) {
      this.supabaseService.markOffline(toErrorMessage(error, 'The feed could not be reached.'));

      return this.serveLocalFeed(filter);
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

  /**
   * Loads one post with its rendered body.
   *
   * Returns `null` only when the slug is genuinely unknown; an unreachable or
   * unconfigured remote serves the bundled copy of the post instead, so a shared
   * link still opens offline.
   */
  async getPostBySlug(slug: string): Promise<PostDetail | null> {
    this.errorSignal.set('');

    if (!this.supabaseService.isConfigured) {
      return this.serveLocalPost(slug);
    }

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

      this.supabaseService.markOnline();

      return mapPostDetailRow(row, userReactions ?? createEmptyUserReactions());
    } catch (error) {
      this.supabaseService.markOffline(toErrorMessage(error, 'This post could not be reached.'));

      return this.serveLocalPost(slug);
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
    if (!this.supabaseService.isConfigured) {
      throw new Error('Publishing needs a Supabase connection, which this build does not have.');
    }

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
    if (!this.supabaseService.isConfigured) {
      throw new Error('Editing needs a Supabase connection, which this build does not have.');
    }

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
    if (!this.supabaseService.isConfigured) {
      throw new Error('Deleting needs a Supabase connection, which this build does not have.');
    }

    const { error } = await this.supabase.from('posts').delete().eq('id', postId);

    if (error) {
      throw new Error(toErrorMessage(error, 'Could not delete this post.'));
    }

    this.postsSignal.update((posts) => posts.filter((post) => post.id !== postId));
  }

  /** Most discussed posts, used by the sidebar's `#discuss` box. */
  async fetchMostDiscussedPosts(limit = 3): Promise<PostSummary[]> {
    if (!this.supabaseService.isConfigured) {
      return this.localMostDiscussedPosts(limit);
    }

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

      this.supabaseService.markOnline();

      return rows.map((row) =>
        mapPostSummaryRow(row, userReactions.get(row.id) ?? createEmptyUserReactions()),
      );
    } catch (error) {
      this.supabaseService.markOffline(
        toErrorMessage(error, 'The discussion sidebar could not be reached.'),
      );

      return this.localMostDiscussedPosts(limit);
    }
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

  /** Keeps the newest copy of each post when pages overlap. */
  private publishPage(posts: PostSummary[], replace: boolean, hasMore: boolean): void {
    this.postsSignal.update((previous) => (replace ? posts : dedupeById([...previous, ...posts])));
    this.hasMoreSignal.set(hasMore);
  }

  /**
   * Answers a feed request from the bundled dataset.
   *
   * Local paging is offset based because there is no server cursor to reuse; the
   * page size, ordering and filters are applied with the same rules the query
   * uses, so switching sources never changes what the reader sees.
   */
  private serveLocalFeed(filter: FeedFilter): PostSummary[] {
    const matching = filterLocalPosts(filter);
    const pageSize = Math.max(1, filter.pageSize);
    const start = Math.max(0, (filter.page - 1) * pageSize);
    const page = matching.slice(start, start + pageSize);
    const hasMore = start + page.length < matching.length;

    this.publishPage(page, filter.page <= 1, hasMore);

    return page;
  }

  /** Serves one bundled post by slug, or `null` when the dataset has no such post. */
  private serveLocalPost(slug: string): PostDetail | null {
    const post = findMockPostBySlug(slug);

    if (!post) {
      return null;
    }

    // Detail pages render an article and its discussion, so the sample content
    // is reported as the source until a live request succeeds again.
    this.supabaseService.markOffline('This post is being served from the bundled dataset.');

    return post;
  }

  /** Bundled posts ordered by discussion volume, mirroring the sidebar query. */
  private localMostDiscussedPosts(limit: number): PostSummary[] {
    this.supabaseService.markOffline(
      'The discussion sidebar is being served from the bundled dataset.',
    );

    return MOCK_POSTS.filter((post) => post.published && post.commentsCount > 0)
      .slice()
      .sort((a, b) => b.commentsCount - a.commentsCount || compareNewestFirst(a, b))
      .slice(0, Math.max(1, limit));
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

/**
 * Newest first, with the id as tie-breaker.
 *
 * Mirrors `order('created_at', { ascending: false }).order('id', { ascending: false })`
 * exactly, so a locally sorted page matches the order the query would return.
 */
function compareNewestFirst(a: PostSummary, b: PostSummary): number {
  const left = Date.parse(a.createdAt);
  const right = Date.parse(b.createdAt);

  if (left !== right) {
    return right - left;
  }

  return b.id.localeCompare(a.id);
}

/**
 * Applies a feed filter to the bundled dataset.
 *
 * Ordering, filtering and the search term follow the same rules as the query
 * builder, including the `top` window and the `relevant` ordering that ranks by
 * reactions before recency. The reading list is account scoped, so it is empty
 * offline: bookmarks live in the remote database.
 */
function filterLocalPosts(filter: FeedFilter): PostSummary[] {
  const searchTerm = sanitizeSearchTerm(filter.searchQuery ?? '').toLowerCase();
  const windowStart = filter.sort === 'top' ? timeRangeStart(filter.timeRange) : null;

  const matching = MOCK_POSTS.filter((post) => {
    if (!post.published) {
      return false;
    }

    if (filter.bookmarkedOnly) {
      return false;
    }

    if (filter.tag && !post.tags.some((tag) => tag.name === filter.tag)) {
      return false;
    }

    if (windowStart && Date.parse(post.createdAt) < Date.parse(windowStart)) {
      return false;
    }

    if (searchTerm.length > 0) {
      const haystack = `${post.title}\n${post.contentMarkdown}`.toLowerCase();

      if (!haystack.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  if (filter.sort === 'latest') {
    return matching.slice().sort(compareNewestFirst);
  }

  return matching
    .slice()
    .sort(
      (a, b) => b.reactionsCount - a.reactionsCount || compareNewestFirst(a, b),
    );
}
