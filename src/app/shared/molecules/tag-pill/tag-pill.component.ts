import { Component, input, output } from '@angular/core';
import type { Tag } from '../../../core/models/tag.model';

/**
 * DEV tag pill: monospace `#name` where the `#` carries the tag's own colour and
 * the pill only reveals that colour on hover.
 *
 * Interactive pills are buttons so they can be focused and activated from the
 * keyboard; the chip variant used by the editor exposes a separate remove
 * button. Non-interactive pills stay a plain span.
 */
@Component({
  selector: 'app-tag-pill',
  template: `
    @if (selectable()) {
      <button
        type="button"
        [style.--tag-color]="tag().hexColor"
        [class]="classes()"
        [attr.aria-label]="'Filter posts tagged ' + tag().name"
        (click)="selected.emit(tag())"
      >
        <span class="opacity-60 mr-0.5">#</span>{{ tag().name }}
      </button>
    } @else {
      <span [style.--tag-color]="tag().hexColor" [class]="classes()">
        <span class="opacity-60 mr-0.5">#</span>{{ tag().name }}
        @if (removable()) {
          <button
            type="button"
            class="ml-1 font-bold hover:text-red-500 focus:outline-none"
            [attr.aria-label]="'Remove tag ' + tag().name"
            (click)="removed.emit(tag())"
          >
            &times;
          </button>
        }
      </span>
    }
  `,
})
export class TagPillComponent {
  tag = input.required<Tag>();
  /** Renders a remove control and emits `removed`. */
  removable = input<boolean>(false);
  /** Makes the pill an interactive filter control. */
  selectable = input<boolean>(false);

  selected = output<Tag>();
  removed = output<Tag>();

  protected classes(): string {
    const base =
      'inline-flex items-center text-xs font-mono px-2 py-1 rounded border border-transparent ' +
      'text-gray-700 mr-1.5 my-0.5 transition-colors duration-150';

    const interactive = this.selectable()
      ? 'cursor-pointer hover:border-current hover:text-[var(--tag-color)]'
      : '';

    return `${base} ${interactive}`;
  }
}
