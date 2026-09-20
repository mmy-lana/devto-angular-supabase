import type { CommentFlatRow, CommentNode } from '../models/comment.model';
import { mapProfileRow } from '../models/profile.model';

/**
 * Visual recursion cap.
 *
 * Deeper replies keep their data but stop indenting, which keeps long threads
 * readable on a 360px viewport instead of collapsing into a column of slivers.
 */
export const MAX_COMMENT_DEPTH = 5;

/**
 * Converts the flat adjacency list returned by Supabase into a nested tree.
 *
 * Runs in `O(N)`: nodes are instantiated once, then linked in a single pass.
 * Depth is resolved recursively with memoisation and a cycle guard, so the
 * result is correct regardless of the order rows arrive in — a reply listed
 * before its parent still lands at the right depth and position.
 *
 * Rows whose parent is missing from the set (deleted parent, partial fetch)
 * become roots rather than disappearing from the discussion.
 */
export function buildCommentTree(
  flatRows: CommentFlatRow[],
  currentUserId?: string,
  userLikedCommentIds: Set<string> = new Set(),
): CommentNode[] {
  const nodeMap = new Map<string, CommentNode>();
  const depthCache = new Map<string, number>();

  for (const row of flatRows) {
    nodeMap.set(row.id, {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentId: row.parent_id,
      contentMarkdown: row.content_markdown,
      contentHtml: row.content_html,
      isDeleted: row.is_deleted,
      likesCount: row.likes_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: mapProfileRow(row.profiles),
      hasLiked: currentUserId !== undefined && userLikedCommentIds.has(row.id),
      replies: [],
      depth: 0,
    });
  }

  const resolveDepth = (node: CommentNode, visiting: Set<string>): number => {
    const cached = depthCache.get(node.id);

    if (cached !== undefined) {
      return cached;
    }

    const parent = node.parentId === null ? null : nodeMap.get(node.parentId);

    if (!parent || visiting.has(node.id)) {
      depthCache.set(node.id, 0);
      return 0;
    }

    visiting.add(node.id);
    const depth = Math.min(resolveDepth(parent, visiting) + 1, MAX_COMMENT_DEPTH);
    visiting.delete(node.id);

    depthCache.set(node.id, depth);
    return depth;
  };

  const rootNodes: CommentNode[] = [];

  for (const row of flatRows) {
    const node = nodeMap.get(row.id);

    if (!node) {
      continue;
    }

    node.depth = resolveDepth(node, new Set<string>());
    const parent = node.parentId === null ? null : nodeMap.get(node.parentId);

    if (parent && parent.id !== node.id) {
      parent.replies.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  sortChronologically(rootNodes);

  return rootNodes;
}

/**
 * Total number of active (non-deleted) comments, matching the database
 * `posts.comments_count` counter maintained by triggers (DATA-04).
 */
export function countActiveCommentNodes(nodes: CommentNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.isDeleted ? 0 : 1) + countActiveCommentNodes(node.replies),
    0,
  );
}

/** Backwards-compatible alias adhering to active comment counts. */
export const countCommentNodes = countActiveCommentNodes;

/** Finds a node anywhere in the tree, or `null` when the id is absent. */
export function findCommentNode(nodes: CommentNode[], commentId: string): CommentNode | null {
  for (const node of nodes) {
    if (node.id === commentId) {
      return node;
    }

    const nested = findCommentNode(node.replies, commentId);

    if (nested) {
      return nested;
    }
  }

  return null;
}

/** Oldest first, recursively — the order a discussion is read in. */
function sortChronologically(nodes: CommentNode[]): void {
  nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const node of nodes) {
    if (node.replies.length > 1) {
      sortChronologically(node.replies);
    }
  }
}
