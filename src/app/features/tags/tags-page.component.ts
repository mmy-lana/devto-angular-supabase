import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagService } from '../../core/services/tag.service';
import { TagPillComponent } from '../../shared/molecules/tag-pill/tag-pill.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';

/**
 * Tag directory.
 *
 * Every tag is listed with how many published posts use it, and each one links to
 * the filtered feed, so this page doubles as the entry point into a topic.
 */
@Component({
  selector: 'app-tags-page',
  imports: [RouterLink, TagPillComponent, ButtonComponent],
  template: `
    <div class="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <header class="mb-5">
        <h1 class="text-2xl font-extrabold text-gray-900">Tags</h1>
        <p class="text-sm text-gray-500">
          Topics the community writes about. Pick one to see every published post under it.
        </p>
      </header>

      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="status" aria-live="polite">
          @for (placeholder of [1, 2, 3, 4, 5, 6]; track placeholder) {
            <div class="h-20 rounded-md bg-white border border-[#d4d4d4] animate-pulse"></div>
          }
          <span class="sr-only">Loading tags…</span>
        </div>
      } @else if (errorMessage(); as error) {
        <div
          role="alert"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3"
        >
          <p class="text-sm text-red-800">{{ error }}</p>
          <app-button variant="danger" size="sm" (clicked)="reload()">Try again</app-button>
        </div>
      } @else if (tags().length === 0) {
        <div class="bg-white border border-[#d4d4d4] rounded-md p-8 text-center">
          <p class="text-gray-700 font-medium mb-1">No tags yet</p>
          <p class="text-xs text-gray-500 mb-4">
            Tags are created with the first post that uses them.
          </p>
          <a routerLink="/new">
            <app-button variant="secondary" size="sm">Write the first post</app-button>
          </a>
        </div>
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          @for (tag of tags(); track tag.id) {
            <a
              [routerLink]="['/']"
              [queryParams]="{ tag: tag.name }"
              class="block bg-white border border-[#d4d4d4] rounded-md p-4 hover:border-[#a3a3a3] transition-colors"
            >
              <app-tag-pill [tag]="tag" [selectable]="true" />
              <p class="mt-2 text-xs text-gray-500 line-clamp-2">
                {{ tag.description || tag.postsCount + ' published post' + (tag.postsCount === 1 ? '' : 's') }}
              </p>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class TagsPageComponent implements OnInit {
  private readonly tagService = inject(TagService);

  protected readonly tags = this.tagService.popularTagsSignal;
  protected readonly loading = this.tagService.loadingSignal;
  protected readonly errorMessage = this.tagService.errorSignal;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected async reload(): Promise<void> {
    await this.tagService.fetchPopularTags(MAX_TAGS);
  }
}

/** Upper bound of the directory listing. */
const MAX_TAGS = 100;
