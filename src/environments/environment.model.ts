/**
 * Environment contract shared by every build target.
 *
 * The concrete values live in `environment.ts` (production) and
 * `environment.development.ts` (development). This module deliberately has no
 * imports so both of those files can depend on it without creating a cycle.
 */
export interface Environment {
  /** `true` for `vite build`, `false` while running `vite`/`vite preview`. */
  readonly production: boolean;
  /** Supabase project URL, e.g. `https://abcdefgh.supabase.co`. */
  readonly supabaseUrl: string;
  /** Supabase anonymous (public) API key. */
  readonly supabaseAnonKey: string;
}

/** Name of the Vite variable that carries the Supabase project URL. */
export const SUPABASE_URL_VARIABLE = 'VITE_SUPABASE_URL';

/** Name of the Vite variable that carries the Supabase anonymous key. */
export const SUPABASE_ANON_KEY_VARIABLE = 'VITE_SUPABASE_ANON_KEY';

/**
 * Normalises a raw `import.meta.env` value.
 *
 * Vite returns `undefined` for variables that are absent from `.env`, and an
 * empty string for variables declared without a value.
 */
export function readViteVariable(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Lists the required Supabase variables that are still unset.
 *
 * Returns an empty array when the configuration is complete.
 */
export function findMissingSupabaseVariables(environment: Environment): string[] {
  const missing: string[] = [];

  if (environment.supabaseUrl.length === 0) {
    missing.push(SUPABASE_URL_VARIABLE);
  }

  if (environment.supabaseAnonKey.length === 0) {
    missing.push(SUPABASE_ANON_KEY_VARIABLE);
  }

  return missing;
}
