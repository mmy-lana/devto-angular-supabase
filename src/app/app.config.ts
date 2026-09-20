import { type ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      // The route table is still empty, so syncing the router with the browser
      // URL would only produce an unmatched-navigation error. Initial navigation
      // is switched back on as soon as the screen components are registered.
      withDisabledInitialNavigation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    // Restores the persisted Supabase session (and its profile row) before the
    // first screen renders, so the header never flashes a signed-out state.
    provideAppInitializer(() => inject(AuthService).initialize()),
  ],
};
