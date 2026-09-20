import { Component, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { TagService } from '../../../core/services/tag.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Left navigation column (desktop only).
 *
 * Popular tags are read from the database rather than hard coded, and selecting
 * one filters the feed in place through the `?tag=` query parameter — the same
 * parameter the feed page reads on load, so a filtered feed is linkable.
 */
@Component({
  selector: 'app-left-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <aside class="space-y-4">
      <nav class="space-y-1" aria-label="Primary">
        <a
          routerLink="/"
          routerLinkActive="bg-[#3b49df]/10 text-[#3b49df]"
          [routerLinkActiveOptions]="{ exact: true }"
          class="flex items-center space-x-3 min-h-11 px-3 py-2 rounded-md text-sm font-medium text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df]"
        >
          <app-icon name="home" size="md" />
          <span>Home</span>
        </a>
        <a
          routerLink="/bookmarks"
          routerLinkActive="bg-[#3b49df]/10 text-[#3b49df]"
          class="flex items-center space-x-3 min-h-11 px-3 py-2 rounded-md text-sm font-medium text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df]"
        >
          <app-icon name="bookmark" size="md" />
          <span>Reading List</span>
        </a>
        <a
          routerLink="/tags"
          routerLinkActive="bg-[#3b49df]/10 text-[#3b49df]"
          class="flex items-center space-x-3 min-h-11 px-3 py-2 rounded-md text-sm font-medium text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df]"
        >
          <app-icon name="tag" size="md" />
          <span>Tags</span>
        </a>
        @if (authService.isAuthenticated()) {
          <a
            routerLink="/new"
            routerLinkActive="bg-[#3b49df]/10 text-[#3b49df]"
            class="flex items-center space-x-3 min-h-11 px-3 py-2 rounded-md text-sm font-medium text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df]"
          >
            <app-icon name="edit" size="md" />
            <span>Create Post</span>
          </a>
        }
      </nav>

      <div id="tags" class="pt-4 border-t border-gray-200">
        <h3 class="px-3 text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
          Popular Tags
        </h3>

        @if (loading()) {
          <div class="px-3 space-y-2" role="status" aria-live="polite">
            @for (placeholder of [1, 2, 3, 4, 5]; track placeholder) {
              <div class="h-6 rounded bg-gray-200 animate-pulse"></div>
            }
            <span class="sr-only">Loading popular tags…</span>
          </div>
        } @else if (tags().length === 0) {
          <p class="px-3 text-xs text-gray-500">
            No tags yet — the first published post creates them.
          </p>
        } @else {
          <div class="space-y-0.5">
            @for (tag of tags(); track tag.id) {
              <a
                [routerLink]="['/']"
                [queryParams]="{ tag: tag.name }"
                class="flex items-center justify-between gap-2 min-h-[44px] px-3 py-1.5 rounded text-xs font-mono text-gray-600 hover:text-black hover:bg-gray-200"
                [class.bg-gray-200]="activeTag() === tag.name"
                [class.font-bold]="activeTag() === tag.name"
                [attr.aria-current]="activeTag() === tag.name ? 'true' : null"
                [attr.aria-label]="'Show posts tagged ' + tag.name"
              >
                <span class="truncate">#{{ tag.name }}</span>
                <span class="text-[10px] text-gray-400 tabular-nums">{{ tag.postsCount }}</span>
              </a>
            }
          </div>
        }
      </div>
    </aside>
  `,
})
export class LeftSidebarComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly tagService = inject(TagService);

  /** Tag currently applied to the feed, read from the URL so it survives reloads. */
  protected readonly activeTag = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('tag') ?? '')),
    { initialValue: '' },
  );

  protected readonly tags = this.tagService.popularTagsSignal;
  protected readonly loading = this.tagService.loadingSignal;
  private readonly loaded = signal<boolean>(false);

  async ngOnInit(): Promise<void> {
    if (this.loaded()) {
      return;
    }

    this.loaded.set(true);
    await this.tagService.fetchPopularTags(8);
  }
}
