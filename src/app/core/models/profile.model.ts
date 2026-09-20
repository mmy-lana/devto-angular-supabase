/**
 * Author of posts and comments. Mirrors `public.profiles`.
 */
export interface Profile {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  websiteUrl: string;
  githubUsername: string;
  twitterUsername: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Raw `public.profiles` row exactly as PostgREST returns it (snake_case).
 *
 * `bio`, `website_url`, `github_username` and `twitter_username` are nullable in
 * the schema: the column default is an empty string, but inserts may pass `null`.
 */
export interface ProfileRow {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  bio: string | null;
  website_url: string | null;
  github_username: string | null;
  twitter_username: string | null;
  created_at: string;
  updated_at: string;
}

/** Avatar service used by the `handle_new_user` trigger as its fallback. */
export function avatarUrlForSeed(seed: string): string {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Converts a database row into the domain model.
 *
 * Nullable text columns collapse to empty strings so templates can render them
 * without null checks; a blank avatar falls back to the deterministic DiceBear
 * image seeded by the username.
 */
export function mapProfileRow(row: ProfileRow): Profile {
  const avatarUrl = row.avatar_url.trim();

  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: avatarUrl.length > 0 ? avatarUrl : avatarUrlForSeed(row.username || row.id),
    bio: row.bio ?? '',
    websiteUrl: row.website_url ?? '',
    githubUsername: row.github_username ?? '',
    twitterUsername: row.twitter_username ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
