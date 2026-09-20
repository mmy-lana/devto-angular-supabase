import { mapProfileRow, type Profile, type ProfileRow } from './profile.model';
import { mapTagRow, type Tag, type TagRow } from './tag.model';
import type { UserReactionsState } from './reaction.model';

/** Feed ordering strategy. `relevant` blends reaction totals into recency. */
export type FeedSortCriteria = 'relevant' | 'latest' | 'top';

/** Recency window applied to `top` feeds. `infinity` disables the window. */
export type FeedTimeRange = 'day' | 'week' | 'month' | 'year' | 'infinity';

/** A post as it appears in a feed card. */
export interface PostSummary {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  readingTimeMinutes: number;
  published: boolean;
  reactionsCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  author: Profile;
  tags: Tag[];
  userReactions: UserReactionsState;
}

/** A post rendered on its own page, including the rendered article body. */
export interface PostDetail extends PostSummary {
  contentMarkdown: string;
  contentHtml: string;
}

/** Fields accepted when publishing a new post. */
export interface CreatePostPayload {
  title: string;
  contentMarkdown: string;
  coverImageUrl?: string | null;
  tagIds: string[];
  published: boolean;
}

/** Fields accepted when editing an existing post; omitted keys stay untouched. */
export interface UpdatePostPayload {
  title?: string;
  contentMarkdown?: string;
  coverImageUrl?: string | null;
  tagIds?: string[];
  published?: boolean;
}

/** Query state driving the feed: ordering, filtering and paging. */
export interface FeedFilter {
  sort: FeedSortCriteria;
  timeRange?: FeedTimeRange;
  tag?: string;
  searchQuery?: string;
  page: number;
  pageSize: number;
}

/**
 * Raw `public.posts` row as returned by PostgREST.
 *
 * `content_markdown` and `content_html` are only fetched by the detail query, so
 * feed queries use {@link PostSummaryRow} instead.
 */
export interface PostRow {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  content_markdown: string;
  content_html: string;
  cover_image_url: string | null;
  reading_time_minutes: number;
  published: boolean;
  reactions_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

/** Embedded tags of a post, joined through `public.post_tags`. */
export interface PostTagEmbedRow {
  tags: TagRow;
}

/**
 * Feed projection: summary columns plus the author and tag embeds requested by
 * the feed query. Both embeds follow non-null foreign keys, so they are always
 * present; `post_tags` is empty (not null) for an untagged post.
 */
export interface PostSummaryRow {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  reading_time_minutes: number;
  published: boolean;
  reactions_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
  post_tags: PostTagEmbedRow[];
}

/** Detail projection: the feed projection plus the article body. */
export interface PostDetailRow extends PostSummaryRow {
  content_markdown: string;
  content_html: string;
}

/** Converts a feed row into the domain model. */
export function mapPostSummaryRow(
  row: PostSummaryRow,
  userReactions: UserReactionsState,
): PostSummary {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    slug: row.slug,
    coverImageUrl: row.cover_image_url,
    readingTimeMinutes: row.reading_time_minutes,
    published: row.published,
    reactionsCount: row.reactions_count,
    commentsCount: row.comments_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: mapProfileRow(row.profiles),
    tags: (row.post_tags ?? []).map((postTag) => mapTagRow(postTag.tags)),
    userReactions,
  };
}

/** Converts a detail row into the domain model. */
export function mapPostDetailRow(
  row: PostDetailRow,
  userReactions: UserReactionsState,
): PostDetail {
  return {
    ...mapPostSummaryRow(row, userReactions),
    contentMarkdown: row.content_markdown,
    contentHtml: row.content_html,
  };
}
