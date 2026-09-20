import { readViteVariable } from './environment.model';
import type { Environment } from './environment.model';

/**
 * Development configuration used by `vite` and `vite preview`.
 *
 * Values come from `.env` (see `.env.example`) and are inlined by Vite. An
 * unset variable stays an empty string so the Supabase client can report
 * exactly which variables are missing instead of failing with an opaque error.
 */
export const environment: Environment = {
  production: false,
  supabaseUrl: readViteVariable(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: readViteVariable(import.meta.env.VITE_SUPABASE_ANON_KEY),
};
