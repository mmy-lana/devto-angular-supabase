/**
 * Topic tag attached to posts. Mirrors `public.tags`.
 */
export interface Tag {
  id: string;
  name: string;
  displayName: string;
  hexColor: string;
  bgColor: string;
  description: string;
  createdAt: string;
}

/**
 * Raw `public.tags` row as returned by PostgREST.
 *
 * `hex_color` and `bg_color` are constrained to `#rrggbb` by a check
 * constraint, so they are always safe to inject into inline styles.
 */
export interface TagRow {
  id: string;
  name: string;
  display_name: string;
  hex_color: string;
  bg_color: string;
  description: string | null;
  created_at: string;
}

/** Converts a database row into the domain model. */
export function mapTagRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    hexColor: row.hex_color,
    bgColor: row.bg_color,
    description: row.description ?? '',
    createdAt: row.created_at,
  };
}
