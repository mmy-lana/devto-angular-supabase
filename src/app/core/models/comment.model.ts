import type { Profile, ProfileRow } from './profile.model';

/**
 * Placeholder body written over a soft-deleted comment.
 *
 * Deleting a comment keeps the row (and therefore its replies) in place, so the
 * original text is replaced by this marker instead of being removed.
 */
export const DELETED_COMMENT_MARKDOWN = '[deleted]';

/** Pre-rendered HTML for {@link DELETED_COMMENT_MARKDOWN}. */
export const DELETED_COMMENT_HTML = '<p class="italic text-gray-400">[deleted]</p>';

/**
 * A comment rendered in the discussion tree.
 *
 * `depth` is clamped so deep threads stay readable on narrow viewports, and
 * `replies` is populated by the tree builder rather than by the database.
 */
export interface CommentNode {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  contentMarkdown: string;
  contentHtml: string;
  isDeleted: boolean;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
  author: Profile;
  hasLiked: boolean;
  replies: CommentNode[];
  depth: number;
}

/** Raw `public.comments` row as returned by PostgREST. */
export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content_markdown: string;
  content_html: string;
  is_deleted: boolean;
  likes_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Comment row with its author embedded through the `comments_author_id_fkey`
 * relationship. `comments.author_id` cascades from `profiles`, so the embedded
 * author is always present.
 */
export interface CommentFlatRow extends CommentRow {
  profiles: ProfileRow;
}

/** Columns required to insert a comment. */
export interface CommentInsertPayload {
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content_markdown: string;
  content_html: string;
}
