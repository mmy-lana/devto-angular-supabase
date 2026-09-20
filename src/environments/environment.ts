import { environment as developmentEnvironment } from './environment.development';
import { readViteVariable } from './environment.model';
import type { Environment } from './environment.model';

/**
 * Development configuration.
 *
 * `vite` and `vite preview` resolve `import.meta.env.PROD` to `false`, which
 * selects `environment.development.ts`; `vite build` selects the production
 * object below. Both read the same `.env` file, so only genuine build-time
 * differences belong in this switch.
 */
const productionEnvironment: Environment = {
  production: true,
  supabaseUrl: readViteVariable(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: readViteVariable(import.meta.env.VITE_SUPABASE_ANON_KEY),
};

/** Active configuration for the running build. Import this, never the variants. */
export const environment: Environment = import.meta.env.PROD
  ? productionEnvironment
  : developmentEnvironment;

export type { Environment } from './environment.model';
