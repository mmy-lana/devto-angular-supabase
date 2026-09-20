import { computed, inject, Injectable, signal } from '@angular/core';
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
 * carries post counts for the sidebar ranking. Creating a tag is idempotent:
 * `getOrCreateTag` resolves an existing row when another author already used the
 * name instead of failing on the unique constraint.
 */
@Injectable({ providedIn: 'root' })
export class TagService {
  private readonly supabase = inject(SupabaseService).client;

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

      return tags;
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not load tags.'));

      return [];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Loads tags with their post counts, most used first. */
  async fetchPopularTags(limit = 12): Promise<TagWithCount[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

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
      this.tagsSignal.set(tags.map(({ postsCount: _postsCount, ...tag }) => tag));

      return tags;
    } catch (error) {
      this.errorSignal.set(toErrorMessage(error, 'Could not load popular tags.'));

      return [];
    } finally {
      this.loadingSignal.set(false);
    }
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
