import { Component, computed, input } from '@angular/core';

/** Inner spacing of the card. `md` drops to 12px on small phones. */
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-3 sm:p-4 lg:p-5',
  lg: 'p-5 sm:p-8',
};

/**
 * DEV retro card shell: white surface, 1px `#d4d4d4` border, 6px radius and a
 * hairline shadow. Content is projected.
 *
 * `hoverable` also reacts to `:focus-within` so keyboard users get the same
 * affordance as pointer users.
 */
@Component({
  selector: 'app-card',
  template: `
    <div [class]="classes()">
      <ng-content></ng-content>
    </div>
  `,
})
export class CardComponent {
  padding = input<CardPadding>('md');
  hoverable = input<boolean>(false);
  bordered = input<boolean>(true);

  protected readonly classes = computed(() =>
    [
      'bg-white rounded-md overflow-hidden',
      this.bordered() ? 'border border-[#d4d4d4] shadow-[0_0_0_1px_rgba(23,23,23,0.05)]' : '',
      this.hoverable() ? 'retro-box-interactive hover:border-[#a3a3a3]' : '',
      PADDING_CLASSES[this.padding()],
    ]
      .filter((part) => part.length > 0)
      .join(' '),
  );
}
