import { inject, Injectable, signal } from '@angular/core';
import { mockReactionCountsForPost } from '../mocks/devto-mock-data';
import {
  createEmptyReactionCounts,
  type ReactionCountSummary,
  type ReactionRow,
  type ReactionType,
  type UserReactionsState,
} from '../models/reaction.model';
import { toErrorMessage } from '../utils/error-message.util';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/** Maximum number of reaction rows read when rebuilding per-kind counters. */
const MAX_REACTION_ROWS = 1000;

/** Message shown when a write is attempted without a remote to write to. */
const OFFLINE_WRITE_MESSAGE =
  'Reactions are unavailable while the app is running on bundled sample content.';

/**
 * Optimistic reactions for posts and comments.
 *
 * Every toggle mutates the caller's signal immediately so the UI reacts on the
 * same frame, then persists the change. When the request fails — offline, RLS
 * rejection, constraint violation — the exact inverse mutation is applied, so
 * the UI can never drift from the database. Anonymous visitors are routed to the
 * sign-in modal instead of silently losing their click.
 *
 * A toggle is locked for the duration of its request (RACE-01). Reaction rows
 * are unique per user and kind, so two clicks in flight together would race:
 * the second insert would be rejected for violating the constraint, its rollback
 * would then undo the first click's optimistic update, and the toolbar would end
 * up showing the opposite of what the database stores.
 */
@Injectable({ providedIn: 'root' })
export class ReactionService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly supabase = this.supabaseService.client;
  private readonly authService = inject(AuthService);

  /** Last reaction error, surfaced by the page that triggered the toggle. */
  readonly errorSignal = signal<string>('');

  /**
   * Toggles currently being written, keyed by target.
   *
   * Keys look like `post:<id>` or `comment:<id>`, so a click on a different post
   * is never blocked by a slow request on this one.
   */
  private readonly inFlightTargets = new Set<string>();

  /**
   * Toggles one reaction on a post.
   *
   * Returns `true` when the change was persisted, `false` when it was rolled
   * back, ignored because an identical toggle is still in flight, or refused
   * because the visitor is not signed in.
   */
  async togglePostReaction(
    postId: string,
    reaction: ReactionType,
    currentState: boolean,
    currentCounts: ReactionCountSummary,
    applyState: (updater: (previous: UserReactionsState) => UserReactionsState) => void,
    applyCounts: (updater: (previous: ReactionCountSummary) => ReactionCountSummary) => void,
  ): Promise<boolean> {
    const target = `post:${postId}`;

    if (this.inFlightTargets.has(target)) {
      return false;
    }

    if (!this.supabaseService.isConfigured) {
      this.errorSignal.set(OFFLINE_WRITE_MESSAGE);

      return false;
    }

    const user = this.authService.currentUser();

    if (!user) {
      this.authService.openAuthModal();

      return false;
    }

    this.errorSignal.set('');
    const nextState = !currentState;
    const delta = nextState ? 1 : -1;

    this.inFlightTargets.add(target);

    applyState((previous) => ({ ...previous, [reaction]: nextState }));
    applyCounts((previous) => ({
      ...previous,
      [reaction]: Math.max(0, currentCounts[reaction] + delta),
      total: Math.max(0, currentCounts.total + delta),
    }));

    try {
      if (nextState) {
        const { error } = await this.supabase
          .from('reactions')
          .insert({ user_id: user.id, post_id: postId, reaction });

        if (error) {
          throw error;
        }
      } else {
        const { error } = await this.supabase
          .from('reactions')
          .delete()
          .match({ user_id: user.id, post_id: postId, reaction });

        if (error) {
          throw error;
        }
      }

      this.supabaseService.markOnline();

      return true;
    } catch (error) {
      // Rollback restores the snapshot the caller handed over, so the counters
      // return to exactly the values the user saw before the toggle.
      applyState((previous) => ({ ...previous, [reaction]: currentState }));
      applyCounts(() => ({ ...currentCounts }));

      this.errorSignal.set(toErrorMessage(error, 'Could not save your reaction. Please try again.'));

      return false;
    } finally {
      this.inFlightTargets.delete(target);
    }
  }

  /**
   * Toggles the `like` reaction on a comment.
   *
   * The caller owns the optimistic tree mutation (see
   * `CommentService.applyCommentReaction`), so this only reports the outcome and
   * requests a rollback through the same callback pattern as post reactions.
   */
  async toggleCommentReaction(
    commentId: string,
    currentState: boolean,
    currentLikes: number,
    applyComment: (updater: (comment: { hasLiked: boolean; likesCount: number }) => {
      hasLiked: boolean;
      likesCount: number;
    }) => void,
  ): Promise<boolean> {
    const target = `comment:${commentId}`;

    if (this.inFlightTargets.has(target)) {
      return false;
    }

    if (!this.supabaseService.isConfigured) {
      this.errorSignal.set(OFFLINE_WRITE_MESSAGE);

      return false;
    }

    const user = this.authService.currentUser();

    if (!user) {
      this.authService.openAuthModal();

      return false;
    }

    this.errorSignal.set('');
    const nextState = !currentState;
    const delta = nextState ? 1 : -1;

    this.inFlightTargets.add(target);

    applyComment((previous) => ({
      hasLiked: nextState,
      likesCount: Math.max(0, previous.likesCount + delta),
    }));

    try {
      if (nextState) {
        const { error } = await this.supabase
          .from('reactions')
          .insert({ user_id: user.id, comment_id: commentId, reaction: 'like' });

        if (error) {
          throw error;
        }
      } else {
        const { error } = await this.supabase
          .from('reactions')
          .delete()
          .match({ user_id: user.id, comment_id: commentId, reaction: 'like' });

        if (error) {
          throw error;
        }
      }

      this.supabaseService.markOnline();

      return true;
    } catch (error) {
      applyComment(() => ({
        hasLiked: currentState,
        likesCount: Math.max(0, currentLikes),
      }));

      this.errorSignal.set(toErrorMessage(error, 'Could not save your reaction. Please try again.'));

      return false;
    } finally {
      this.inFlightTargets.delete(target);
    }
  }

  /**
   * Rebuilds per-kind counters for a post.
   *
   * `public.posts.reactions_count` is maintained by a trigger and stays the
   * authoritative total, so it is passed in as `knownTotal`; this method only
   * fills in the per-kind breakdown the floating bar renders.
   *
   * PERF-01: when the remote is unconfigured or the query fails, the breakdown
   * comes from the bundled dataset instead of collapsing to a row of zeros. A
   * reader who can see five hearts on a card must not see none on the article.
   */
  async fetchReactionCountsForPost(
    postId: string,
    knownTotal: number,
  ): Promise<ReactionCountSummary> {
    if (!this.supabaseService.isConfigured) {
      return localReactionCounts(postId, knownTotal);
    }

    const counts = createEmptyReactionCounts();

    try {
      const { data, error } = await this.supabase
        .from('reactions')
        .select('reaction')
        .eq('post_id', postId)
        .limit(MAX_REACTION_ROWS);

      if (error) {
        throw error;
      }

      for (const row of (data ?? []) as Pick<ReactionRow, 'reaction'>[]) {
        if (row.reaction in counts) {
          counts[row.reaction] += 1;
        }
      }

      this.supabaseService.markOnline();
    } catch (error) {
      this.supabaseService.markOffline(
        toErrorMessage(error, 'Reaction counts are being served from the bundled dataset.'),
      );

      return localReactionCounts(postId, knownTotal);
    }

    return { ...counts, total: knownTotal };
  }
}

/**
 * Local per-kind breakdown for a post.
 *
 * Sample posts carry their own counts. For a post that only exists in the remote
 * database the breakdown is unknown, so the authoritative total is kept and the
 * per-kind counters stay at zero rather than being invented.
 */
function localReactionCounts(postId: string, knownTotal: number): ReactionCountSummary {
  const sample = mockReactionCountsForPost(postId);

  if (sample.total === 0) {
    return { ...createEmptyReactionCounts(), total: knownTotal };
  }

  return sample;
}
