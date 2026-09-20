/**
 * Reaction kinds available on both posts and comments.
 *
 * The union mirrors the `public.reaction_kind` PostgreSQL enum, so a value of
 * this type can be sent to the database without translation.
 */
export type ReactionType =
  | 'like'
  | 'unicorn'
  | 'exploding_head'
  | 'raised_hands'
  | 'fire'
  | 'bookmark';

/** Every reaction kind, in the order the toolbar renders them. */
export const REACTION_TYPES = [
  'like',
  'unicorn',
  'exploding_head',
  'raised_hands',
  'fire',
  'bookmark',
] as const satisfies readonly ReactionType[];

/** Aggregated reaction totals for a single post or comment. */
export interface ReactionCountSummary {
  like: number;
  unicorn: number;
  exploding_head: number;
  raised_hands: number;
  fire: number;
  bookmark: number;
  total: number;
}

/** Which reactions the signed-in visitor has already applied. */
export interface UserReactionsState {
  like: boolean;
  unicorn: boolean;
  exploding_head: boolean;
  raised_hands: boolean;
  fire: boolean;
  bookmark: boolean;
}

/** A single persisted reaction. Exactly one of `postId`/`commentId` is set. */
export interface ReactionRecord {
  id: string;
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  reaction: ReactionType;
  createdAt: string;
}

/** Raw `public.reactions` row as returned by PostgREST. */
export interface ReactionRow {
  id: string;
  user_id: string;
  post_id: string | null;
  comment_id: string | null;
  reaction: ReactionType;
  created_at: string;
}

/** All-zero reaction totals, used before a post's reactions are fetched. */
export function createEmptyReactionCounts(): ReactionCountSummary {
  return {
    like: 0,
    unicorn: 0,
    exploding_head: 0,
    raised_hands: 0,
    fire: 0,
    bookmark: 0,
    total: 0,
  };
}

/** No-reactions state for anonymous visitors, and the base for optimistic updates. */
export function createEmptyUserReactions(): UserReactionsState {
  return {
    like: false,
    unicorn: false,
    exploding_head: false,
    raised_hands: false,
    fire: false,
    bookmark: false,
  };
}

/** Converts a database row into the domain model. */
export function mapReactionRow(row: ReactionRow): ReactionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    postId: row.post_id,
    commentId: row.comment_id,
    reaction: row.reaction,
    createdAt: row.created_at,
  };
}
