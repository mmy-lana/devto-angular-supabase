import { Component, computed, input } from '@angular/core';

/** Colour treatment of the badge. */
export type BadgeVariant = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'outline';

/** Density of the badge. */
export type BadgeSize = 'sm' | 'md';

const BASE_CLASSES =
  'inline-flex items-center gap-1 font-medium rounded-full border whitespace-nowrap';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  brand: 'bg-[#3b49df]/10 text-[#2f3ab2] border-[#3b49df]/20',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  outline: 'bg-white text-gray-700 border-[#d4d4d4]',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

/**
 * Small status label (counts, states, section markers).
 *
 * `dot` prepends a colour indicator for statuses that must read without relying
 * on colour alone; the text content remains the accessible signal.
 */
@Component({
  selector: 'app-badge',
  template: `
    <span [class]="classes()">
      @if (dot()) {
        <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true"></span>
      }
      <ng-content></ng-content>
    </span>
  `,
})
export class BadgeComponent {
  variant = input<BadgeVariant>('neutral');
  size = input<BadgeSize>('sm');
  /** Renders a leading status dot. */
  dot = input<boolean>(false);

  protected readonly classes = computed(() =>
    [BASE_CLASSES, VARIANT_CLASSES[this.variant()], SIZE_CLASSES[this.size()]].join(' '),
  );
}
