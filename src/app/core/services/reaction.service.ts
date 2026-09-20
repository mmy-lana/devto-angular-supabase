import { inject, Injectable, signal } from '@angular/core';
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

/**
 * Optimistic reactions for posts and comments.
 *
 * Every toggle mutates the caller's signal immediately so the UI reacts on the
 * same frame, then persists the change. When the request fails — offline, RLS
 * rejection, constraint violation — the exact inverse mutation is applied, so
 * the UI can never drift from the database. Anonymous visitors are routed to the
 * sign-in modal instead of silently losing their click.
 */
@Injectable({ providedIn: 'root' })
export class ReactionService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  /** Last reaction error, surfaced by the page that triggered the toggle. */
  readonly errorSignal = signal<string>('');

  /**
   * Toggles one reaction on a post.
   *
   * Returns `true` when the change was persisted, `false` when it was rolled
   * back or the visitor is not signed in.
   */
  async togglePostReaction(
    postId: string,
    reaction: ReactionType,
    currentState: boolean,
    currentCounts: ReactionCountSummary,
    applyState: (updater: (previous: UserReactionsState) => UserReactionsState) => void,
    applyCounts: (updater: (previous: ReactionCountSummary) => ReactionCountSummary) => void,
  ): Promise<boolean> {
    const user = this.authService.currentUser();

    if (!user) {
      this.authService.openAuthModal();

      return false;
    }

    this.errorSignal.set('');
    const nextState = !currentState;
    const delta = nextState ? 1 : -1;

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

      return true;
    } catch (error) {
      // Rollback restores the snapshot the caller handed over, so the counters
      // return to exactly the values the user saw before the toggle.
      applyState((previous) => ({ ...previous, [reaction]: currentState }));
      applyCounts(() => ({ ...currentCounts }));

      this.errorSignal.set(toErrorMessage(error, 'Could not save your reaction. Please try again.'));

      return false;
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
    const user = this.authService.currentUser();

    if (!user) {
      this.authService.openAuthModal();

      return false;
    }

    this.errorSignal.set('');
    const nextState = !currentState;
    const delta = nextState ? 1 : -1;

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

      return true;
    } catch (error) {
      applyComment(() => ({
        hasLiked: currentState,
        likesCount: Math.max(0, currentLikes),
      }));

      this.errorSignal.set(toErrorMessage(error, 'Could not save your reaction. Please try again.'));

      return false;
    }
  }

  /**
   * Rebuilds per-kind counters for a post.
   *
   * `public.posts.reactions_count` is maintained by a trigger and stays the
   * authoritative total, so it is passed in as `knownTotal`; this method only
   * fills in the per-kind breakdown the floating bar renders.
   */
  async fetchReactionCountsForPost(
    postId: string,
    knownTotal: number,
  ): Promise<ReactionCountSummary> {
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
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not load reaction counts.'));

      return { ...counts, total: knownTotal };
    }

    return { ...counts, total: knownTotal };
  }
}
