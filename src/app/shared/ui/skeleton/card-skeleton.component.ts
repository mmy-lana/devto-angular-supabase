import { Component, computed, input } from '@angular/core';

/**
 * Feed placeholder shown while posts are loading.
 *
 * The skeleton mirrors the real post card box metrics (same border, radius and
 * responsive padding) so swapping in real content does not shift the layout.
 * `lines` controls how many body lines are faked for longer cards.
 */
@Component({
  selector: 'app-card-skeleton',
  template: `
    <div
      class="bg-white border border-[#d4d4d4] rounded-md mb-3 p-3 sm:p-4 lg:p-5 animate-pulse"
      role="presentation"
      aria-hidden="true"
    >
      <div class="flex items-center space-x-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-gray-200"></div>
        <div class="space-y-1.5 flex-1">
          <div class="h-3.5 bg-gray-200 rounded w-1/4"></div>
          <div class="h-3 bg-gray-200 rounded w-1/6"></div>
        </div>
      </div>

      <div class="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>

      @for (line of bodyLines(); track line) {
        <div class="h-4 bg-gray-200 rounded mb-2" [class]="line === 1 ? 'w-1/2' : 'w-full'"></div>
      }

      <div class="flex items-center justify-between pt-2">
        <div class="flex space-x-2">
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
        </div>
        <div class="h-4 w-12 bg-gray-200 rounded"></div>
      </div>
    </div>
  `,
})
export class CardSkeletonComponent {
  /** Number of fake body lines below the title. */
  lines = input<number>(1);

  protected readonly bodyLines = computed(() =>
    Array.from({ length: Math.max(1, this.lines()) }, (_unused, index) => index + 1),
  );
}
