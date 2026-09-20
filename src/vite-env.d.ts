/// <reference types="vite/client" />

/**
 * Environment variables exposed to the browser bundle.
 *
 * Vite inlines every `import.meta.env.VITE_*` reference at build time, so these
 * values are part of the client bundle and must never hold service-role keys.
 * Supabase's anonymous key is safe to ship: every table is protected by RLS.
 */
interface ImportMetaEnv {
  /** Project URL taken from Supabase → Project Settings → API. */
  readonly VITE_SUPABASE_URL?: string;
  /** Public anonymous key taken from Supabase → Project Settings → API. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
