import { Component, computed, input, output, signal } from '@angular/core';
import type { Tag } from '../../core/models/tag.model';
import { TagPillComponent } from '../../shared/molecules/tag-pill/tag-pill.component';

/** Maximum number of suggestions rendered under the field. */
const MAX_SUGGESTIONS = 6;

/** Minimum query length before a brand new tag can be created. */
const MIN_CREATE_LENGTH = 2;

/**
 * Tag picker used by the post editor.
 *
 * The component is presentational: it filters the tags it is given and reports
 * the resulting selection. New names are surfaced through `tagCreated` so the
 * container can persist them through `TagService`, which keeps database concerns
 * out of the UI layer.
 */
@Component({
  selector: 'app-tag-selector-chips',
  imports: [TagPillComponent],
  template: `
    <div class="w-full">
      <div class="flex items-center justify-between mb-1.5">
        <label [attr.for]="inputId" class="text-xs font-semibold text-gray-700">
          Tags
          <span class="font-normal text-gray-500">(up to {{ maxTags() }})</span>
        </label>
        @if (selectedTags().length > 0) {
          <span class="text-[11px] text-gray-500">{{ selectedTags().length }}/{{ maxTags() }}</span>
        }
      </div>

      <div
        class="flex flex-wrap items-center gap-1 w-full min-h-11 px-2 py-1.5 border rounded-md bg-white transition-colors"
        [class]="
          disabled()
            ? 'border-[#e2e8f0] bg-gray-50'
            : isOpen()
              ? 'border-[#3b49df] ring-1 ring-[#3b49df]'
              : 'border-[#d4d4d4]'
        "
      >
        @for (tag of selectedTags(); track tag.id) {
          <app-tag-pill [tag]="tag" [removable]="!disabled()" (removed)="removeTag($event)" />
        }

        @if (selectedTags().length < maxTags()) {
          <div class="relative flex-1 min-w-[8rem]">
            <input
              [id]="inputId"
              type="text"
              role="combobox"
              autocomplete="off"
              aria-autocomplete="list"
              [attr.aria-expanded]="isOpen()"
              [attr.aria-controls]="listboxId"
              [attr.aria-activedescendant]="activeOptionId()"
              [attr.placeholder]="selectedTags().length === 0 ? placeholder() : ''"
              [disabled]="disabled()"
              [value]="query()"
              class="w-full py-1 text-xs border-0 bg-transparent focus:outline-none disabled:cursor-not-allowed"
              (input)="onQueryInput($event)"
              (keydown)="onKeydown($event)"
              (focus)="onFocus()"
              (blur)="onBlur()"
            />

            @if (isOpen()) {
              <ul
                [id]="listboxId"
                role="listbox"
                [attr.aria-label]="'Tag suggestions'"
                class="absolute left-0 top-full z-30 mt-2 w-64 max-h-64 overflow-y-auto rounded-md border border-[#d4d4d4] bg-white py-1 shadow-lg"
              >
                @if (loading()) {
                  <li class="px-3 py-2 text-xs text-gray-500">Loading tags…</li>
                } @else {
                  @for (tag of suggestions(); track tag.id; let index = $index) {
                    <li
                      [id]="optionId(index)"
                      role="option"
                      [attr.aria-selected]="index === highlightedIndex()"
                      [class]="
                        index === highlightedIndex()
                          ? 'bg-[#3b49df]/10 cursor-pointer'
                          : 'cursor-pointer hover:bg-gray-50'
                      "
                      (mousedown)="$event.preventDefault(); addTag(tag)"
                    >
                      <span class="flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-gray-700">
                        <span class="opacity-60">#</span>{{ tag.name }}
                        <span class="ml-auto text-[10px] font-sans text-gray-400 truncate max-w-[8rem]">
                          {{ tag.displayName }}
                        </span>
                      </span>
                    </li>
                  }

                  @if (canCreate()) {
                    <li
                      [id]="optionId(suggestions().length)"
                      role="option"
                      [attr.aria-selected]="highlightedIndex() === suggestions().length"
                      [class]="
                        highlightedIndex() === suggestions().length
                          ? 'bg-[#3b49df]/10 cursor-pointer'
                          : 'cursor-pointer hover:bg-gray-50'
                      "
                      (mousedown)="$event.preventDefault(); createTag()"
                    >
                      <span class="block px-3 py-1.5 text-xs text-[#3b49df]">
                        Create “{{ normalizedQuery() }}”
                      </span>
                    </li>
                  }

                  @if (suggestions().length === 0 && !canCreate()) {
                    <li class="px-3 py-2 text-xs text-gray-500">
                      {{ noResultsMessage() }}
                    </li>
                  }
                }
              </ul>
            }
          </div>
        } @else {
          <span class="py-1 text-[11px] text-gray-500">Maximum number of tags reached.</span>
        }
      </div>

      @if (error()) {
        <p class="mt-1 text-xs text-red-600">{{ error() }}</p>
      } @else {
        <p class="mt-1 text-xs text-gray-500">
          Give readers context: tags drive the feed filters and topic lists.
        </p>
      }
    </div>
  `,
})
export class TagSelectorChipsComponent {
  private static nextId = 0;

  /** Tags that can be picked, usually the most used tags in the database. */
  availableTags = input<Tag[]>([]);
  selectedTags = input<Tag[]>([]);
  maxTags = input<number>(4);
  placeholder = input<string>('Add up to 4 tags...');
  /** `true` while `availableTags` is still being fetched. */
  loading = input<boolean>(false);
  disabled = input<boolean>(false);
  /** Validation or service error rendered under the field. */
  error = input<string>('');

  tagsChange = output<Tag[]>();
  /** Emitted with the raw name when the user asks for a tag that does not exist. */
  tagCreated = output<string>();

  protected readonly inputId = `tag-selector-${TagSelectorChipsComponent.nextId++}`;
  protected readonly listboxId = `${this.inputId}-listbox`;

  protected readonly query = signal<string>('');
  protected readonly highlightedIndex = signal<number>(0);
  protected readonly isFocused = signal<boolean>(false);

  protected readonly normalizedQuery = computed(() => this.query().trim().toLowerCase());

  protected readonly suggestions = computed(() => {
    const needle = this.normalizedQuery();
    const selectedIds = new Set(this.selectedTags().map((tag) => tag.id));

    return this.availableTags()
      .filter((tag) => !selectedIds.has(tag.id))
      .filter(
        (tag) =>
          needle.length === 0 ||
          tag.name.includes(needle) ||
          tag.displayName.toLowerCase().includes(needle),
      )
      .slice(0, MAX_SUGGESTIONS);
  });

  protected readonly canCreate = computed(() => {
    const needle = this.normalizedQuery();

    if (needle.length < MIN_CREATE_LENGTH || this.selectedTags().length >= this.maxTags()) {
      return false;
    }

    return !this.availableTags().some((tag) => tag.name === needle);
  });

  protected readonly isOpen = computed(() => this.isFocused() && this.normalizedQuery().length > 0);

  protected readonly noResultsMessage = computed(() =>
    this.normalizedQuery().length === 0
      ? 'Start typing to search tags.'
      : `No tag matches “${this.query().trim()}”.`,
  );

  protected readonly activeOptionId = computed(() => {
    if (!this.isOpen()) {
      return null;
    }

    return this.optionId(this.highlightedIndex());
  });

  protected optionId(index: number): string {
    return `${this.inputId}-option-${index}`;
  }

  protected onFocus(): void {
    this.isFocused.set(true);
  }

  protected onBlur(): void {
    this.isFocused.set(false);
    this.highlightedIndex.set(0);
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.highlightedIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveHighlight(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.commitHighlighted();
        break;
      case 'Escape':
        this.query.set('');
        this.onBlur();
        break;
      case 'Backspace':
        if (this.query().length === 0) {
          this.removeLastTag();
        }
        break;
      default:
        break;
    }
  }

  /** Adds an existing tag to the selection. */
  addTag(tag: Tag): void {
    if (this.disabled() || this.selectedTags().length >= this.maxTags()) {
      return;
    }

    if (this.selectedTags().some((selected) => selected.id === tag.id)) {
      this.query.set('');
      return;
    }

    this.tagsChange.emit([...this.selectedTags(), tag]);
    this.resetQuery();
  }

  /** Removes a tag from the selection. */
  removeTag(tag: Tag): void {
    if (this.disabled()) {
      return;
    }

    this.tagsChange.emit(this.selectedTags().filter((selected) => selected.id !== tag.id));
  }

  /** Requests creation of the tag currently typed in. */
  createTag(): void {
    const name = this.normalizedQuery();

    if (!this.canCreate()) {
      return;
    }

    this.tagCreated.emit(name);
    this.resetQuery();
  }

  private commitHighlighted(): void {
    const optionIndex = this.highlightedIndex();
    const suggestions = this.suggestions();

    if (optionIndex < suggestions.length) {
      this.addTag(suggestions[optionIndex]);
      return;
    }

    if (this.canCreate()) {
      this.createTag();
      return;
    }

    if (suggestions.length === 0) {
      this.createTag();
    }
  }

  private moveHighlight(step: number): void {
    const optionCount = this.suggestions().length + (this.canCreate() ? 1 : 0);

    if (optionCount === 0) {
      return;
    }

    const next = (this.highlightedIndex() + step + optionCount) % optionCount;
    this.highlightedIndex.set(next);
  }

  private removeLastTag(): void {
    const selected = this.selectedTags();

    if (selected.length === 0) {
      return;
    }

    this.removeTag(selected[selected.length - 1]);
  }

  private resetQuery(): void {
    this.query.set('');
    this.highlightedIndex.set(0);
  }
}
