import { Component, computed, input } from '@angular/core';

/** Icon glyphs available to the application. */
export type IconName =
  | 'alert'
  | 'bell'
  | 'bookmark'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'close'
  | 'comment'
  | 'edit'
  | 'external-link'
  | 'github'
  | 'heart'
  | 'home'
  | 'link'
  | 'plus'
  | 'search'
  | 'share'
  | 'tag'
  | 'trash'
  | 'twitter'
  | 'user';

/** Rendered size of the glyph. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconDefinition {
  /** `d` attributes of the glyph, drawn in a 24x24 viewBox. */
  readonly paths: readonly string[];
  /** Solid glyphs (brand marks) are filled instead of stroked. */
  readonly filled?: boolean;
}

const ICONS: Record<IconName, IconDefinition> = {
  alert: {
    paths: [
      'M12 9v2m0 4h.01M10.29 3.86l-8.02 13.5A1 1 0 003.14 19h17.72a1 1 0 00.87-1.64l-8.02-13.5a1 1 0 00-1.72 0z',
    ],
  },
  bell: {
    paths: [
      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    ],
  },
  bookmark: {
    paths: ['M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'],
  },
  check: { paths: ['M5 13l4 4L19 7'] },
  'chevron-down': { paths: ['M19 9l-7 7-7-7'] },
  'chevron-left': { paths: ['M15 19l-7-7 7-7'] },
  close: { paths: ['M6 18L18 6M6 6l12 12'] },
  comment: {
    paths: [
      'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    ],
  },
  edit: {
    paths: [
      'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    ],
  },
  'external-link': {
    paths: ['M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'],
  },
  github: {
    filled: true,
    paths: [
      'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    ],
  },
  heart: {
    paths: [
      'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    ],
  },
  home: {
    paths: [
      'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    ],
  },
  link: {
    paths: [
      'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    ],
  },
  plus: { paths: ['M12 4v16m8-8H4'] },
  search: { paths: ['M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'] },
  share: {
    paths: [
      'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
    ],
  },
  tag: {
    paths: [
      'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
    ],
  },
  trash: {
    paths: [
      'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    ],
  },
  twitter: {
    filled: true,
    paths: [
      'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z',
    ],
  },
  user: {
    paths: ['M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'],
  },
};

const SIZE_CLASSES: Record<IconSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

/**
 * Inline SVG icon.
 *
 * Decorative by default (`aria-hidden`), because icons are almost always
 * accompanied by a text label. Pass `label` when the icon is the only content of
 * a control so assistive technology announces it.
 *
 * Solid glyphs (`github`, `twitter`) are filled; pass `filled` to also fill a
 * stroked glyph, which is how the reaction toolbar renders an active state.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      [class]="classes()"
      [attr.viewBox]="'0 0 24 24'"
      [attr.fill]="isFilled() ? 'currentColor' : 'none'"
      [attr.stroke]="isFilled() ? null : 'currentColor'"
      [attr.stroke-width]="isFilled() ? null : strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label()"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false"
    >
      @if (label()) {
        <title>{{ label() }}</title>
      }
      @for (path of paths(); track path) {
        <path [attr.d]="path"></path>
      }
    </svg>
  `,
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<IconSize>('md');
  /** Accessible name; omit for decorative icons. */
  label = input<string | null>(null);
  /** Stroke width of outline glyphs. */
  strokeWidth = input<number>(2);
  /** Fills the glyph with the current colour (active/selected states). */
  filled = input<boolean>(false);

  protected readonly paths = computed(() => ICONS[this.name()].paths);

  protected readonly isFilled = computed(() => this.filled() || ICONS[this.name()].filled === true);

  protected readonly classes = computed(() => `${SIZE_CLASSES[this.size()]} block shrink-0`);
}
