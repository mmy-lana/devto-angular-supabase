/**
 * Dev-only entry point for the design-system harness at `/preview.html`.
 *
 * It renders every primitive, molecule and domain component so they can be
 * inspected and exercised in isolation, and it doubles as a compile-time check
 * of every template, because the harness imports them all.
 *
 * Components that need a signed-in visitor — the inline reply composer, the
 * reaction bar and the pages themselves — require Supabase credentials: copy
 * `.env.example` to `.env` and restart the dev server. Without credentials
 * everything else still renders; only those auth-aware parts log a configuration
 * error when opened.
 */
import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation, type Routes } from '@angular/router';
import { PreviewAppComponent, PreviewBlankComponent } from './preview-app.component';
import '../styles.css';

bootstrapApplication(PreviewAppComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // The harness renders components that use `routerLink`. Links resolve to a
    // blank component so exercising them never logs a router error.
    provideRouter([{ path: '**', component: PreviewBlankComponent }] as Routes, withDisabledInitialNavigation()),
  ],
}).catch((error: unknown) => console.error(error));
