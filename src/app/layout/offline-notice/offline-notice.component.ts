import { Component, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

/**
 * Slim notice that tells the reader which content source is on screen.
 *
 * Two situations reach it: a build without Supabase credentials, and a running
 * app whose live requests have started failing. Both are served from the bundled
 * dataset, so the notice states that plainly instead of leaving the reader to
 * wonder why nothing they do is saved.
 *
 * It is announced politely rather than as an alert: the page is still usable and
 * the message is informational.
 */
@Component({
  selector: 'app-offline-notice',
  template: `
    @if (supabaseService.offlineModeSignal()) {
      <div
        role="status"
        aria-live="polite"
        class="border-b border-[#f0d28a] bg-[#fff8e5] px-4 py-2 text-center text-xs leading-snug text-[#7a5c04]"
      >
        <span class="font-semibold">Sample content.</span>
        This build is serving its bundled articles and discussions, so posts you
        write or reactions you send are not saved.
        @if (supabaseService.isConfigured) {
          Live data returns as soon as the database is reachable again.
        } @else {
          Add the Supabase variables from .env.example to use the live database.
        }
      </div>
    }
  `,
})
export class OfflineNoticeComponent {
  protected readonly supabaseService = inject(SupabaseService);
}
