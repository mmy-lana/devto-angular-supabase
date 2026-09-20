import { Component, computed, input } from '@angular/core';

/**
 * Article placeholder shown while a single post is loading.
 *
 * Reproduces the post-detail box metrics (title block, 12-column grid with the
 * reaction rail, author card and discussion area) so the real page lands in the
 * same position without layout shift.
 */
@Component({
  selector: 'app-detail-skeleton',
  template: `
    <div class="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 animate-pulse" role="presentation" aria-hidden="true">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="hidden lg:block lg:col-span-1">
          <div class="space-y-4">
            <div class="w-12 h-12 rounded-full bg-gray-200"></div>
            <div class="w-12 h-12 rounded-full bg-gray-200"></div>
            <div class="w-12 h-12 rounded-full bg-gray-200"></div>
          </div>
        </div>

        <div class="lg:col-span-8 bg-white border border-[#d4d4d4] rounded-md p-4 sm:p-8">
          <div class="w-16 h-16 rounded-full bg-gray-200 mb-4"></div>
          <div class="h-8 bg-gray-200 rounded w-4/5 mb-3"></div>
          <div class="h-5 bg-gray-200 rounded w-1/3 mb-6"></div>

          <div class="space-y-3">
            @for (line of bodyLines(); track line) {
              <div class="h-4 bg-gray-200 rounded" [class]="line % 4 === 0 ? 'w-2/3' : 'w-full'"></div>
            }
          </div>

          <div class="h-40 bg-gray-100 rounded-md mt-8"></div>

          <div class="mt-10 border-t border-[#e2e8f0] pt-6 space-y-4">
            <div class="h-5 bg-gray-200 rounded w-1/4"></div>
            <div class="h-20 bg-gray-100 rounded-md"></div>
          </div>
        </div>

        <aside class="lg:col-span-3">
          <div class="bg-white border border-[#d4d4d4] rounded-md p-5">
            <div class="w-16 h-16 rounded-full bg-gray-200 mb-3"></div>
            <div class="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div class="h-9 bg-gray-200 rounded-md w-full"></div>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class DetailSkeletonComponent {
  /** Number of fake body lines. */
  lines = input<number>(10);

  protected readonly bodyLines = computed(() =>
    Array.from({ length: Math.max(1, this.lines()) }, (_unused, index) => index + 1),
  );
}
