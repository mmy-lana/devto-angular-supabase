import { Component, computed, forwardRef, input, model, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Sequential id source for label/`aria-describedby` wiring. */
let nextControlId = 0;

const BASE_CLASSES =
  'w-full px-3 py-2.5 text-sm text-gray-900 bg-white border rounded-md resize-y ' +
  'placeholder-gray-400 transition-colors focus:outline-none focus:ring-1 ' +
  'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';

/**
 * Multi-line text field with label, hint, error state and an optional character
 * counter. Mirrors `InputComponent`: usable as `[(value)]` or with `ngModel`.
 */
@Component({
  selector: 'app-textarea',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextareaComponent),
      multi: true,
    },
  ],
  template: `
    <div class="w-full">
      @if (label()) {
        <label [attr.for]="controlId" class="block text-xs font-semibold text-gray-700 mb-1">
          {{ label() }}
          @if (required()) {
            <span class="text-red-500" aria-hidden="true">*</span>
          }
        </label>
      }

      <textarea
        [id]="controlId"
        [value]="value()"
        [attr.rows]="rows()"
        [attr.name]="name()"
        [attr.placeholder]="placeholder()"
        [attr.maxlength]="maxLength()"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-required]="required() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        [disabled]="isDisabled()"
        [class]="classes()"
        (input)="handleInput($event)"
        (blur)="handleBlur()"
      ></textarea>

      <div class="flex items-start justify-between gap-2">
        <div class="flex-1">
          @if (error()) {
            <p [id]="errorId" class="mt-1 text-xs text-red-600">{{ error() }}</p>
          } @else if (hint()) {
            <p [id]="hintId" class="mt-1 text-xs text-gray-500">{{ hint() }}</p>
          }
        </div>

        @if (maxLength(); as limit) {
          <p class="mt-1 text-xs text-gray-400 tabular-nums" aria-hidden="true">
            {{ value().length }}/{{ limit }}
          </p>
        }
      </div>
    </div>
  `,
})
export class TextareaComponent implements ControlValueAccessor {
  /** Two-way bindable value (also used by `ngModel`). */
  value = model<string>('');

  label = input<string>('');
  placeholder = input<string>('');
  hint = input<string>('');
  error = input<string>('');
  rows = input<number>(3);
  name = input<string | null>(null);
  required = input<boolean>(false);
  disabled = input<boolean>(false);
  maxLength = input<number | null>(null);

  protected readonly controlId = `app-textarea-${nextControlId++}`;
  protected readonly errorId = `${this.controlId}-error`;
  protected readonly hintId = `${this.controlId}-hint`;

  private readonly disabledByForm = signal<boolean>(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());

  protected readonly classes = computed(() =>
    [
      BASE_CLASSES,
      this.error()
        ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
        : 'border-[#d4d4d4] focus:border-[#3b49df] focus:ring-[#3b49df]',
    ].join(' '),
  );

  protected readonly describedBy = computed(() => {
    if (this.error()) {
      return this.errorId;
    }

    return this.hint() ? this.hintId : null;
  });

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
  }

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLTextAreaElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected handleBlur(): void {
    this.onTouched();
  }
}
