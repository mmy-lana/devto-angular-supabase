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
 * Substrings that identify the sample values shipped in `.env.example`.
 *
 * A deployment that copied the example file without editing it, or a build
 * environment that defines the variables as empty strings, has to be treated
 * exactly like a missing configuration: the application reads its bundled
 * sample content instead of issuing requests that are guaranteed to fail.
 */
const PLACEHOLDER_MARKERS = [
  'your-supabase-project',
  'your-supabase-anon-key',
  'your-project',
  'your-anon-key',
  'changeme',
  'replace-me',
];

/** `true` when a value is empty or still holds a value from `.env.example`. */
export function isPlaceholderValue(value: string): boolean {
  const normalized = readViteVariable(value).toLowerCase();

  return (
    normalized.length === 0 || PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker))
  );
}

/** `true` for an absolute `http`/`https` URL, which is all `createClient` accepts. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Outcome of inspecting an environment, with a reason for every problem found. */
export interface SupabaseConfigurationReport {
  /** `true` only when a usable remote URL and key are both present. */
  readonly isConfigured: boolean;
  /** Human readable reasons the remote is unusable; empty when it is usable. */
  readonly issues: readonly string[];
}

/**
 * Decides whether the build can talk to a Supabase project.
 *
 * Never throws: an unusable configuration is a supported state, not a failure.
 * The application serves its bundled sample dataset and reports the reason
 * through {@link SupabaseConfigurationReport.issues} instead of failing to start.
 */
export function inspectSupabaseConfiguration(environment: Environment): SupabaseConfigurationReport {
  const issues: string[] = [];
  const url = readViteVariable(environment.supabaseUrl);
  const key = readViteVariable(environment.supabaseAnonKey);

  if (url.length === 0) {
    issues.push(`${SUPABASE_URL_VARIABLE} is not set`);
  } else if (isPlaceholderValue(url)) {
    issues.push(`${SUPABASE_URL_VARIABLE} still holds the value from .env.example`);
  } else if (!isHttpUrl(url)) {
    issues.push(`${SUPABASE_URL_VARIABLE} is not an absolute http(s) URL`);
  }

  if (key.length === 0) {
    issues.push(`${SUPABASE_ANON_KEY_VARIABLE} is not set`);
  } else if (isPlaceholderValue(key)) {
    issues.push(`${SUPABASE_ANON_KEY_VARIABLE} still holds the value from .env.example`);
  }

  return { isConfigured: issues.length === 0, issues };
}
