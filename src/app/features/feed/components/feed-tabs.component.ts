import { Component, input, output } from '@angular/core';
import type { FeedSortCriteria, FeedTimeRange } from '../../../core/models/post.model';

interface TimeRangeOption {
  readonly value: FeedTimeRange;
  readonly label: string;
}

const TIME_RANGE_OPTIONS: readonly TimeRangeOption[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'infinity', label: 'Infinity' },
];

/**
 * Primary feed sort switcher.
 *
 * `Top` exposes a nested timeframe picker, which only appears for that sort
 * because the window is meaningless for `Latest` and `Relevant`. The timeframe
 * is kept when switching away and back so the user's choice survives the toggle.
 */
@Component({
  selector: 'app-feed-tabs',
  template: `
    <div class="flex items-center justify-between gap-3 mb-3">
      <nav class="flex space-x-1 sm:space-x-2" aria-label="Feed sort options">
        @for (option of sortOptions; track option.value) {
          <button
            type="button"
            [class]="tabClasses(currentSort() === option.value)"
            [attr.aria-current]="currentSort() === option.value ? 'page' : null"
            (click)="sortChange.emit(option.value)"
          >
            {{ option.label }}
          </button>
        }
      </nav>

      @if (currentSort() === 'top') {
        <label class="flex items-center gap-1.5">
          <span class="sr-only">Filter top posts by timeframe</span>
          <select
            [value]="currentTimeRange()"
            class="text-xs bg-white border border-[#d4d4d4] rounded px-2 py-1 text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]"
            (change)="onTimeRangeChange($event)"
          >
            @for (option of timeRangeOptions; track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </label>
      }
    </div>
  `,
})
export class FeedTabsComponent {
  currentSort = input.required<FeedSortCriteria>();
  currentTimeRange = input<FeedTimeRange>('week');

  sortChange = output<FeedSortCriteria>();
  timeRangeChange = output<FeedTimeRange>();

  protected readonly sortOptions: readonly { value: FeedSortCriteria; label: string }[] = [
    { value: 'relevant', label: 'Relevant' },
    { value: 'latest', label: 'Latest' },
    { value: 'top', label: 'Top' },
  ];

  protected readonly timeRangeOptions = TIME_RANGE_OPTIONS;

  protected tabClasses(isActive: boolean): string {
    const base =
      'px-3 py-1.5 text-sm sm:text-base rounded font-medium transition-colors cursor-pointer ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]';

    return isActive
      ? `${base} text-black font-bold bg-white border border-[#d4d4d4]`
      : `${base} text-gray-600 hover:text-[#3b49df] hover:bg-white/60`;
  }

  protected onTimeRangeChange(event: Event): void {
    this.timeRangeChange.emit((event.target as HTMLSelectElement).value as FeedTimeRange);
  }
}
