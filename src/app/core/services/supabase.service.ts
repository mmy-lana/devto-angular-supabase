import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { findMissingSupabaseVariables } from '../../../environments/environment.model';

/**
 * Thrown while the Supabase client is being constructed when the build is
 * missing its credentials. The message is written for developers and is rendered
 * verbatim by the bootstrap error screen in `main.ts`.
 */
export class SupabaseConfigurationError extends Error {
  /** Environment variables that have no value in the current build. */
  readonly missingVariables: readonly string[];

  constructor(missingVariables: readonly string[]) {
    super(
      `Supabase is not configured for this build. Set ${missingVariables.join(', ')} ` +
        'in a .env file at the project root (copy .env.example) and restart the dev server.',
    );
    this.name = 'SupabaseConfigurationError';
    this.missingVariables = missingVariables;
  }
}

/**
 * Owns the single Supabase client instance for the application.
 *
 * The client is created eagerly on first injection so a misconfigured
 * environment fails fast with an actionable message instead of surfacing as a
 * confusing network error on the first query. Sessions are persisted in local
 * storage, refreshed in the background, and PKCE is used for OAuth and
 * magic-link redirects.
 *
 * The client is intentionally untyped: row shapes are declared as explicit
 * `*Row` interfaces in `core/models` and mapped to domain models at the service
 * boundary, which keeps query results honest without hand-maintaining PostgREST
 * relationship metadata.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  /** Shared Supabase client. Never sign out or replace it outside `AuthService`. */
  readonly client: SupabaseClient;

  constructor() {
    const missingVariables = findMissingSupabaseVariables(environment);

    if (missingVariables.length > 0) {
      throw new SupabaseConfigurationError(missingVariables);
    }

    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'devto-mock-platform',
        },
      },
    });
  }
}
