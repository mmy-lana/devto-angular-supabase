import { Component, computed, input, signal } from '@angular/core';
import { avatarUrlForSeed } from '../../../core/models/profile.model';

/** Rendered diameter of the avatar. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

const PIXEL_SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

/**
 * Circular author avatar.
 *
 * A broken or empty URL falls back to the deterministic DiceBear image (the same
 * service the `handle_new_user` trigger uses), so a profile is never rendered
 * with a missing picture. `width`/`height` are set explicitly to reserve the box
 * and avoid layout shift while the image loads.
 */
@Component({
  selector: 'app-avatar',
  template: `
    <img
      [src]="resolvedSrc()"
      [alt]="alt()"
      [attr.width]="pixels()"
      [attr.height]="pixels()"
      [class]="classes()"
      loading="lazy"
      decoding="async"
      (error)="markFailed()"
    />
  `,
})
export class AvatarComponent {
  src = input.required<string>();
  alt = input<string>('User avatar');
  size = input<AvatarSize>('md');
  /** Extra seed for the fallback image; defaults to the alt text. */
  fallbackSeed = input<string>('');

  /** URL that failed to load, if any. Keeps the flag in sync with `src`. */
  private readonly failedSrc = signal<string | null>(null);

  protected readonly resolvedSrc = computed(() => {
    const src = this.src().trim();

    if (src.length === 0 || this.failedSrc() === src) {
      return avatarUrlForSeed(this.fallbackSeed() || this.alt());
    }

    return src;
  });

  protected readonly pixels = computed(() => PIXEL_SIZES[this.size()]);

  protected readonly classes = computed(
    () =>
      `rounded-full object-cover border border-gray-200 bg-gray-100 flex-shrink-0 inline-block ${SIZE_CLASSES[this.size()]}`,
  );

  protected markFailed(): void {
    this.failedSrc.set(this.src().trim());
  }
}
