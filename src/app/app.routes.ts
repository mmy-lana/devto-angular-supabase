import type { Routes } from '@angular/router';

/**
 * Application route table.
 *
 * The table is registered at bootstrap but intentionally has no entries during
 * the foundation phase: the feed, post-detail, editor and login screens it will
 * point at are delivered in the later phases, and `app.config.ts` keeps initial
 * navigation switched off until then. Registering an empty table now means the
 * router, its providers and the `authGuard` are wired from the start, so adding
 * a screen later is a matter of appending one entry.
 */
export const routes: Routes = [];
