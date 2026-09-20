import { Component, computed, input, output } from '@angular/core';

/** Visual emphasis of the button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

/** Touch footprint of the button; `md` and `lg` keep a 44px tall hitbox. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE_CLASSES =
  'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ' +
  'disabled:cursor-not-allowed cursor-pointer select-none';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // UI-03: the small size keeps a 44px hitbox, the minimum comfortable tap
  // target, while staying visually compact through padding and text size.
  sm: 'min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs gap-1.5',
  md: 'min-h-11 px-4 py-2 text-sm gap-2',
  lg: 'min-h-12 px-5 py-2.5 text-base gap-2',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#3b49df] hover:bg-[#2f3ab2] text-white border border-transparent shadow-sm focus-visible:ring-[#3b49df]',
  secondary:
    'bg-transparent hover:bg-gray-100 text-[#3b49df] hover:text-[#2f3ab2] border border-[#3b49df] focus-visible:ring-[#3b49df]',
  ghost:
    'bg-transparent hover:bg-black/5 text-gray-700 border border-transparent focus-visible:ring-gray-300',
  danger: 'bg-red-600 hover:bg-red-700 text-white border border-transparent focus-visible:ring-red-500',
  outline:
    'bg-white hover:bg-gray-50 text-gray-800 border border-[#d4d4d4] focus-visible:ring-gray-300',
};

/**
 * Retro DEV styled button.
 *
 * The label is projected so callers own the content (text, icon or both). Pass
 * `ariaLabel` whenever the visible content is not readable text.
 */
@Component({
  selector: 'app-button',
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-busy]="loading() ? 'true' : null"
      [attr.title]="title()"
      [class]="classes()"
      (click)="clicked.emit($event)"
    >
      @if (loading()) {
        <svg
          class="w-4 h-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('secondary');
  size = input<ButtonSize>('md');
  type = input<'button' | 'submit' | 'reset'>('button');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  fullWidth = input<boolean>(false);
  /** Accessible name, required for icon-only buttons. */
  ariaLabel = input<string | null>(null);
  /** Native tooltip text. */
  title = input<string | null>(null);

  clicked = output<MouseEvent>();

  protected readonly classes = computed(() =>
    [BASE_CLASSES, SIZE_CLASSES[this.size()], VARIANT_CLASSES[this.variant()], this.fullWidth() ? 'w-full' : '']
      .filter((part) => part.length > 0)
      .join(' '),
  );
}
