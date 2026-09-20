import { computed, inject, Injectable, signal } from '@angular/core';
import { MOCK_TAGS } from '../mocks/devto-mock-data';
import { toErrorMessage } from '../utils/error-message.util';
import { mapTagRow, type Tag, type TagRow } from '../models/tag.model';
import { SupabaseService } from './supabase.service';

/** A tag together with how many posts carry it. */
export interface TagWithCount extends Tag {
  postsCount: number;
}

/** `public.tags` row with the aggregate embed used for post counts. */
interface TagWithCountRow extends TagRow {
  post_tags: { count: number }[] | null;
}

/** Length of a generated tag name, matching the `tags.name` check constraint. */
const MAX_TAG_NAME_LENGTH = 30;

/** Minimum length accepted by `public.tags.name`. */
const MIN_TAG_NAME_LENGTH = 2;

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = '23505';

/**
 * Colour pairs handed out to newly created tags, cycled by name hash so the same
 * tag always gets the same colours.
 */
const TAG_COLOR_PALETTE: readonly { hexColor: string; bgColor: string }[] = [
  { hexColor: '#3b49df', bgColor: '#eef0ff' },
  { hexColor: '#dd0031', bgColor: '#fff0f2' },
  { hexColor: '#0a7f4f', bgColor: '#e8f7f0' },
  { hexColor: '#b45309', bgColor: '#fdf4e7' },
  { hexColor: '#7c3aed', bgColor: '#f4eeff' },
  { hexColor: '#0e7490', bgColor: '#e9f7fa' },
  { hexColor: '#be123c', bgColor: '#fdeef2' },
  { hexColor: '#4d7c0f', bgColor: '#f3f9e7' },
];

/**
 * Tag catalogue and creation.
 *
 * `tagsSignal` caches the whole catalogue for pickers, and `popularTagsSignal`
 * carries post counts for the sidebar ranking. Both fall back to the bundled
 * catalogue when the remote is unconfigured or unreachable, so tag chips, the
 * sidebar ranking and the post cards that reference those tags stay consistent
 * while the app runs on sample content.
 *
 * The ranking is ordered and truncated by `fetchPopularTags`, but it never
 * writes back into `tagsSignal`: the editor's picker reads that signal as the
 * complete catalogue, so publishing a top-eight list into it would silently
 * remove tags the author was about to choose. Creating a tag is idempotent:
 * `getOrCreateTag` resolves an existing row when another author already used the
 * name instead of failing on the unique constraint.
 */
@Injectable({ providedIn: 'root' })
export class TagService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly supabase = this.supabaseService.client;

  readonly tagsSignal = signal<Tag[]>([]);
  readonly popularTagsSignal = signal<TagWithCount[]>([]);
  readonly loadingSignal = signal<boolean>(false);
  readonly errorSignal = signal<string>('');

  /** Tags ordered by post count, highest first. */
  readonly rankedTags = computed(() =>
    [...this.popularTagsSignal()].sort((a, b) => b.postsCount - a.postsCount),
  );

  /** Loads the whole catalogue (used by the editor's tag picker). */
  async fetchTags(): Promise<Tag[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

    if (!this.supabaseService.isConfigured) {
      const tags = this.publishLocalCatalogue();

      this.loadingSignal.set(false);

      return tags;
    }

    try {
      const { data, error } = await this.supabase
        .from('tags')
        .select('id, name, display_name, hex_color, bg_color, description, created_at')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      const tags = ((data ?? []) as unknown as TagRow[]).map(mapTagRow);
      this.tagsSignal.set(tags);
      this.supabaseService.markOnline();

      return tags;
    } catch (error) {
      this.errorSignal.set('');

      return this.publishLocalCatalogue(
        toErrorMessage(error, 'The tag catalogue could not be reached.'),
      );
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Loads tags with their post counts, most used first. */
  async fetchPopularTags(limit = 12): Promise<TagWithCount[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

    if (!this.supabaseService.isConfigured) {
      const tags = this.publishLocalRanking(limit);

      this.loadingSignal.set(false);

      return tags;
    }

    try {
      const { data, error } = await this.supabase
        .from('tags')
        .select('id, name, display_name, hex_color, bg_color, description, created_at, post_tags(count)')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      const tags = ((data ?? []) as unknown as TagWithCountRow[])
        .map((row) => ({ ...mapTagRow(row), postsCount: row.post_tags?.[0]?.count ?? 0 }))
        .sort((a, b) => b.postsCount - a.postsCount || a.name.localeCompare(b.name))
        .slice(0, limit);

      this.popularTagsSignal.set(tags);
      this.supabaseService.markOnline();

      return tags;
    } catch (error) {
      this.errorSignal.set('');

      return this.publishLocalRanking(
        limit,
        toErrorMessage(error, 'The popular tags could not be reached.'),
      );
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Publishes the bundled catalogue.
   *
   * Reports the fallback through the connectivity signals rather than
   * `errorSignal`: the request succeeded as far as the reader is concerned, and
   * the shell already tells them the content is local.
   */
  private publishLocalCatalogue(reason = 'The tag catalogue is being served from the bundled dataset.'): Tag[] {
    const tags = MOCK_TAGS.map(({ postsCount: _postsCount, ...tag }) => tag);

    this.supabaseService.markOffline(reason);
    this.tagsSignal.set(tags);

    return tags;
  }

  /** Publishes the bundled ranking, ordered and limited exactly like the query. */
  private publishLocalRanking(limit: number, reason?: string): TagWithCount[] {
    const tags = MOCK_TAGS.slice()
      .sort((a, b) => b.postsCount - a.postsCount || a.name.localeCompare(b.name))
      .slice(0, Math.max(1, limit));

    this.supabaseService.markOffline(
      reason ?? 'The popular tags are being served from the bundled dataset.',
    );
    this.popularTagsSignal.set(tags);

    return tags;
  }

  /**
   * Creates a tag, or returns the existing one when the name is taken.
   *
   * The name is slugified to satisfy the `tags.name` constraint, while
   * `displayName` keeps the author's capitalisation for rendering.
   */
  async getOrCreateTag(rawName: string): Promise<Tag> {
    const name = toTagName(rawName);

    if (name.length < MIN_TAG_NAME_LENGTH) {
      throw new Error('Tag names need at least 2 letters or numbers.');
    }

    if (!this.supabaseService.isConfigured) {
      throw new Error('Creating tags needs a Supabase connection, which this build does not have.');
    }

    const existing = this.tagsSignal().find((tag) => tag.name === name);

    if (existing) {
      return existing;
    }

    const colors = TAG_COLOR_PALETTE[hashName(name) % TAG_COLOR_PALETTE.length];

    const { data, error } = await this.supabase
      .from('tags')
      .insert({
        name,
        display_name: toDisplayName(rawName, name),
        hex_color: colors.hexColor,
        bg_color: colors.bgColor,
      })
      .select('id, name, display_name, hex_color, bg_color, description, created_at')
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const refreshed = await this.fetchTags();
        const raced = refreshed.find((tag) => tag.name === name);

        if (raced) {
          return raced;
        }
      }

      throw new Error(toErrorMessage(error, `Could not create the tag “${name}”.`));
    }

    const tag = mapTagRow(data as unknown as TagRow);
    this.tagsSignal.update((tags) => [...tags.filter((candidate) => candidate.id !== tag.id), tag]);

    return tag;
  }

  /** Resolves a list of raw names into persisted tags, preserving order. */
  async resolveTags(rawNames: string[]): Promise<Tag[]> {
    const resolved: Tag[] = [];

    for (const rawName of rawNames) {
      if (rawName.trim().length === 0) {
        continue;
      }

      const tag = await this.getOrCreateTag(rawName);

      if (!resolved.some((candidate) => candidate.id === tag.id)) {
        resolved.push(tag);
      }
    }

    return resolved;
  }
}

/** Slugifies a user supplied tag name to satisfy the database check constraint. */
export function toTagName(rawName: string): string {
  return (rawName ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_NAME_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Builds the client-side placeholder shown for a tag the author just typed.
 *
 * The row is only written when the post is published, but the chip has to look
 * final immediately, so the placeholder reuses the same slug and palette entry
 * `getOrCreateTag` will use. Its id is synthetic (`pending:<name>`), which keeps
 * it distinguishable from database rows until the tags are resolved.
 */
export function createPendingTag(rawName: string): Tag {
  const name = toTagName(rawName);
  const colors = TAG_COLOR_PALETTE[hashName(name) % TAG_COLOR_PALETTE.length];

  return {
    id: `pending:${name}`,
    name,
    displayName: toDisplayName(rawName, name),
    hexColor: colors.hexColor,
    bgColor: colors.bgColor,
    description: '',
    createdAt: new Date().toISOString(),
  };
}

/** True when a tag only exists in the editor and has not been written yet. */
export function isPendingTag(tag: Tag): boolean {
  return tag.id.startsWith('pending:');
}

/** Keeps the author's capitalisation for display, e.g. `Web Dev`. */
function toDisplayName(rawName: string, fallback: string): string {
  const trimmed = (rawName ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_NAME_LENGTH);

  return trimmed.length >= MIN_TAG_NAME_LENGTH ? trimmed : fallback;
}

/** Small stable hash so a name always maps to the same palette entry. */
function hashName(name: string): number {
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 1_000_003;
  }

  return hash;
}
