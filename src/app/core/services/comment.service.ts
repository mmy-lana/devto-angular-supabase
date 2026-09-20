import { computed, inject, Injectable, signal } from '@angular/core';
import { MOCK_COMMENTS } from '../mocks/devto-mock-data';
import {
  DELETED_COMMENT_HTML,
  DELETED_COMMENT_MARKDOWN,
  type CommentFlatRow,
  type CommentNode,
} from '../models/comment.model';
import {
  buildCommentTree,
  countCommentNodes,
  findCommentNode,
  MAX_COMMENT_DEPTH,
} from '../utils/comment-tree.builder';
import { isNetworkFailure, toErrorMessage } from '../utils/error-message.util';
import { AuthService } from './auth.service';
import { MarkdownService } from './markdown.service';
import { SupabaseService } from './supabase.service';

/** Columns and embeds requested for the discussion of a post. */
const COMMENT_SELECT = `
  id,
  post_id,
  author_id,
  parent_id,
  content_markdown,
  content_html,
  is_deleted,
  likes_count,
  created_at,
  updated_at,
  profiles!comments_author_id_fkey (*)
`;

/**
 * Threaded discussion state for a single post.
 *
 * A post's comments are fetched once as a flat list and turned into a tree
 * client-side, so rendering never issues a query per reply. Creating and
 * deleting a comment updates the tree signal immediately: the new reply appears
 * under its parent without a refetch, and a deleted comment keeps its position
 * with a placeholder body so the replies below it stay readable.
 *
 * When the remote is unconfigured or unreachable the same tree is served from
 * the bundled dataset, and `usingSampleDataSignal` records that fact so deletes
 * update the sample tree in place instead of pretending to write to a database.
 */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly supabase = this.supabaseService.client;
  private readonly authService = inject(AuthService);
  private readonly markdownService = inject(MarkdownService);

  readonly commentsTreeSignal = signal<CommentNode[]>([]);
  readonly loadingSignal = signal<boolean>(false);
  readonly errorSignal = signal<string>('');

  /**
   * `true` while the published tree comes from the bundled dataset.
   *
   * Mutations use it to decide between writing to the database and updating the
   * local tree, so an offline reader still sees their own delete take effect.
   */
  readonly usingSampleDataSignal = signal<boolean>(false);

  /** Every comment in the thread, replies included. */
  readonly totalCount = computed(() => countCommentNodes(this.commentsTreeSignal()));

  /** Loads and nests the discussion of one post. */
  async loadCommentsForPost(postId: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

    if (!this.supabaseService.isConfigured) {
      this.publishLocalDiscussion(postId, 'This discussion is being served from the bundled dataset.');
      this.loadingSignal.set(false);

      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as CommentFlatRow[];
      const likedCommentIds = await this.fetchLikedCommentIds(rows);

      this.commentsTreeSignal.set(
        buildCommentTree(rows, this.authService.currentUser()?.id, likedCommentIds),
      );
      this.usingSampleDataSignal.set(false);
      this.supabaseService.markOnline();
    } catch (error) {
      this.publishLocalDiscussion(postId, toErrorMessage(error, 'The discussion could not be reached.'));
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Publishes the bundled discussion for a post.
   *
   * Posts that only exist in the remote database have no bundled discussion, so
   * they render an empty thread with the composer disabled instead of an error.
   */
  private publishLocalDiscussion(postId: string, reason: string): void {
    this.commentsTreeSignal.set(MOCK_COMMENTS[postId] ?? []);
    this.usingSampleDataSignal.set(true);
    this.supabaseService.markOffline(reason);
  }

  /** Clears the discussion, e.g. when leaving a post. */
  reset(): void {
    this.commentsTreeSignal.set([]);
    this.errorSignal.set('');
  }

  /**
   * Publishes a comment and inserts it into the tree without a refetch.
   *
   * Throws when the insert fails so the composer can show the error next to the
   * submit button.
   */
  async addComment(postId: string, markdown: string, parentId: string | null = null): Promise<CommentNode> {
    const user = this.authService.currentUser();
    const profile = this.authService.currentProfile();
    const body = markdown.trim();

    if (this.usingSampleDataSignal()) {
      throw new Error(
        'This discussion is shown from bundled sample content, so it cannot be replied to. Connect Supabase to join in.',
      );
    }

    if (!this.supabaseService.isConfigured) {
      throw new Error('Commenting needs a Supabase connection, which this build does not have.');
    }

    if (!user || !profile) {
      throw new Error('Sign in to join the discussion.');
    }

    if (body.length === 0) {
      throw new Error('Write something before posting your comment.');
    }

    const contentHtml = this.markdownService.parseMarkdownToHtml(body);

    const { data, error } = await this.supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: user.id,
        parent_id: parentId,
        content_markdown: body,
        content_html: contentHtml,
      })
      .select('id, post_id, author_id, parent_id, content_markdown, content_html, likes_count, created_at, updated_at')
      .single();

    if (error || !data) {
      throw new Error(toErrorMessage(error, 'Could not publish your comment.'));
    }

    const row = data as {
      id: string;
      post_id: string;
      author_id: string;
      parent_id: string | null;
      content_markdown: string;
      content_html: string;
      likes_count: number;
      created_at: string;
      updated_at: string;
    };

    const created: CommentNode = {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentId: row.parent_id,
      contentMarkdown: row.content_markdown,
      contentHtml: row.content_html,
      isDeleted: false,
      likesCount: row.likes_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: profile,
      hasLiked: false,
      replies: [],
      depth: 0,
    };

    this.commentsTreeSignal.update((tree) => insertCommentNode(tree, created));

    return created;
  }

  /**
   * Soft deletes a comment, keeping its replies visible.
   *
   * The update requests the affected id back, because a filter that matches
   * nothing is not an error: PostgREST answers a rejected or unmatched update
   * with an empty body and no error at all. Without that check the tree would
   * show a deleted comment that the database still holds.
   */
  async deleteComment(commentId: string): Promise<void> {
    if (this.usingSampleDataSignal()) {
      this.markCommentDeletedLocally(commentId);

      return;
    }

    if (!this.supabaseService.isConfigured) {
      throw new Error('Deleting needs a Supabase connection, which this build does not have.');
    }

    try {
      const { data, error } = await this.supabase
        .from('comments')
        .update({
          is_deleted: true,
          content_markdown: DELETED_COMMENT_MARKDOWN,
          content_html: DELETED_COMMENT_HTML,
        })
        .eq('id', commentId)
        .select('id');

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        // Nothing was updated: the row is gone, or row level security hid it
        // from this visitor. Reporting success would leave the tree lying.
        throw new Error('This comment could not be deleted. Reload the page and try again.');
      }

      this.markCommentDeletedLocally(commentId);
      this.supabaseService.markOnline();
    } catch (error) {
      if (isNetworkFailure(error)) {
        // The write never reached the database, so the local tree is untouched
        // and the reader gets a message they can act on.
        this.supabaseService.markOffline(toErrorMessage(error, 'The discussion is unreachable.'));
      }

      throw error instanceof Error
        ? error
        : new Error(toErrorMessage(error, 'Could not delete this comment.'));
    }
  }

  /** Applies the soft delete to the published tree. */
  private markCommentDeletedLocally(commentId: string): void {
    this.commentsTreeSignal.update((tree) =>
      mapTreeNode(tree, commentId, (node) => ({
        ...node,
        isDeleted: true,
        contentMarkdown: DELETED_COMMENT_MARKDOWN,
        contentHtml: DELETED_COMMENT_HTML,
      })),
    );
  }

  /**
   * Applies an optimistic like/unlike to one comment in the tree.
   *
   * `updater` receives the current like state and returns the next one, which is
   * what `ReactionService.toggleCommentReaction` uses to roll back on failure.
   */
  applyCommentReaction(
    commentId: string,
    updater: (comment: { hasLiked: boolean; likesCount: number }) => {
      hasLiked: boolean;
      likesCount: number;
    },
  ): void {
    this.commentsTreeSignal.update((tree) =>
      mapTreeNode(tree, commentId, (node) => ({
        ...node,
        ...updater({ hasLiked: node.hasLiked, likesCount: node.likesCount }),
      })),
    );
  }

  /** Current like state of a comment, or `null` when it is not loaded. */
  getCommentLikeState(commentId: string): { hasLiked: boolean; likesCount: number } | null {
    const node = findCommentNode(this.commentsTreeSignal(), commentId);

    return node ? { hasLiked: node.hasLiked, likesCount: node.likesCount } : null;
  }

  /** Comment ids the signed-in visitor has already liked. */
  private async fetchLikedCommentIds(rows: CommentFlatRow[]): Promise<Set<string>> {
    const likedIds = new Set<string>();
    const userId = this.authService.currentUser()?.id;

    if (!userId || rows.length === 0) {
      return likedIds;
    }

    const { data, error } = await this.supabase
      .from('reactions')
      .select('comment_id')
      .eq('user_id', userId)
      .eq('reaction', 'like')
      .in(
        'comment_id',
        rows.map((row) => row.id),
      );

    if (error || !data) {
      return likedIds;
    }

    for (const row of data as { comment_id: string | null }[]) {
      if (row.comment_id) {
        likedIds.add(row.comment_id);
      }
    }

    return likedIds;
  }
}

/** Immutably inserts a comment under its parent, or at the end of the roots. */
function insertCommentNode(tree: CommentNode[], created: CommentNode): CommentNode[] {
  if (created.parentId === null) {
    return [...tree, created];
  }

  const parent = findCommentNode(tree, created.parentId);

  if (!parent) {
    return [...tree, created];
  }

  const depth = Math.min(parent.depth + 1, MAX_COMMENT_DEPTH);
  const node = { ...created, depth };

  return mapTreeNode(tree, parent.id, (current) => ({ ...current, replies: [...current.replies, node] }));
}

/** Rebuilds the tree with `transform` applied to the matching node. */
function mapTreeNode(
  nodes: CommentNode[],
  commentId: string,
  transform: (node: CommentNode) => CommentNode,
): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === commentId) {
      return transform(node);
    }

    if (node.replies.length === 0) {
      return node;
    }

    return { ...node, replies: mapTreeNode(node.replies, commentId, transform) };
  });
}
