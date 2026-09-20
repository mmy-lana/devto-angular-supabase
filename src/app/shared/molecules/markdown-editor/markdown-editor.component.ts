import { Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { MarkdownService } from '../../../core/services/markdown.service';
import { IconComponent, type IconName } from '../../ui/icon/icon.component';

/** Editor pane currently visible. */
type EditorTab = 'write' | 'preview';

interface ToolbarAction {
  readonly label: string;
  readonly icon: IconName | null;
  /** Text shown when no icon is used (markdown punctuation). */
  readonly glyph: string;
  readonly prefix: string;
  readonly suffix: string;
}

const TOOLBAR_ACTIONS: readonly ToolbarAction[] = [
  { label: 'Bold', icon: null, glyph: 'B', prefix: '**', suffix: '**' },
  { label: 'Italic', icon: null, glyph: 'I', prefix: '*', suffix: '*' },
  { label: 'Inline code', icon: null, glyph: '`', prefix: '`', suffix: '`' },
  { label: 'Code block', icon: null, glyph: '{ }', prefix: '```\n', suffix: '\n```' },
  { label: 'Quote', icon: null, glyph: '\u201C', prefix: '> ', suffix: '' },
  { label: 'Link', icon: 'link', glyph: '', prefix: '[', suffix: '](https://)' },
];

/**
 * Split Write/Preview markdown editor with a syntax toolbar.
 *
 * The toolbar wraps the current selection (or inserts a placeholder when nothing
 * is selected) and restores focus plus selection, so writing stays uninterrupted.
 * Preview HTML is produced by `MarkdownService`, which is the same renderer used
 * for published articles.
 */
@Component({
  selector: 'app-markdown-editor',
  imports: [IconComponent],
  template: `
    <div class="border border-[#d4d4d4] rounded-md bg-white overflow-hidden">
      <div class="flex items-center justify-between gap-2 border-b border-[#e2e8f0] px-2 sm:px-3 py-1.5 bg-gray-50">
        <div class="flex" role="tablist" aria-label="Editor view">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === 'write'"
            [class]="tabClasses(activeTab() === 'write')"
            (click)="activeTab.set('write')"
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === 'preview'"
            [class]="tabClasses(activeTab() === 'preview')"
            (click)="activeTab.set('preview')"
          >
            Preview
          </button>
        </div>

        @if (activeTab() === 'write') {
          <div class="hidden sm:flex items-center space-x-0.5">
            @for (action of toolbarActions; track action.label) {
              <button
                type="button"
                [class]="toolbarClasses()"
                [attr.title]="action.label"
                [attr.aria-label]="action.label"
                (click)="applyAction(action)"
              >
                @if (action.icon; as iconName) {
                  <app-icon [name]="iconName" size="sm" />
                } @else {
                  <span aria-hidden="true">{{ action.glyph }}</span>
                }
              </button>
            }
          </div>
        }
      </div>

      <div class="p-3">
        @if (activeTab() === 'write') {
          <textarea
            #editor
            [value]="content()"
            [attr.rows]="rows()"
            [attr.placeholder]="placeholder()"
            [attr.aria-label]="placeholder()"
            class="w-full font-mono text-sm focus:outline-none resize-y text-gray-900 border-0 bg-transparent leading-relaxed"
            (input)="onInputChange($event)"
          ></textarea>
        } @else {
          @if (trimmedContent().length > 0) {
            <div class="min-h-[160px] text-sm p-1" [innerHTML]="renderedPreview()"></div>
          } @else {
            <p class="min-h-[160px] flex items-center justify-center text-sm text-gray-400">
              Nothing to preview yet. Switch back to Write and start typing.
            </p>
          }
        }
      </div>
    </div>
  `,
})
export class MarkdownEditorComponent {
  private readonly markdownService = inject(MarkdownService);
  private readonly editorRef = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  content = input<string>('');
  placeholder = input<string>('Write your content using markdown...');
  rows = input<number>(10);

  contentChange = output<string>();

  protected readonly activeTab = signal<EditorTab>('write');
  protected readonly toolbarActions = TOOLBAR_ACTIONS;

  protected readonly trimmedContent = computed(() => this.content().trim());

  protected readonly renderedPreview = computed(() =>
    this.markdownService.parseMarkdownToHtml(this.content()),
  );

  protected tabClasses(isActive: boolean): string {
    const base = 'px-3 py-1.5 text-sm border-b-2 focus:outline-none transition-colors';

    return isActive
      ? `${base} font-bold text-gray-900 border-[#3b49df]`
      : `${base} text-gray-600 border-transparent hover:text-[#3b49df]`;
  }

  protected toolbarClasses(): string {
    return (
      'inline-flex items-center justify-center min-w-8 min-h-8 px-1.5 rounded text-xs font-bold ' +
      'text-gray-600 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]'
    );
  }

  protected onInputChange(event: Event): void {
    this.contentChange.emit((event.target as HTMLTextAreaElement).value);
  }

  /** Wraps the current selection with the action's markdown syntax. */
  protected applyAction(action: ToolbarAction): void {
    const textarea = this.editorRef()?.nativeElement;

    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const selected = current.substring(start, end) || placeholderForAction(action);

    this.contentChange.emit(
      `${current.substring(0, start)}${action.prefix}${selected}${action.suffix}${current.substring(end)}`,
    );

    // Restore focus and select the wrapped text once Angular has written the
    // emitted value back into the textarea.
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + action.prefix.length,
        start + action.prefix.length + selected.length,
      );
    }, 0);
  }
}

/** Selection placeholder used when the toolbar is used with nothing selected. */
function placeholderForAction(action: ToolbarAction): string {
  switch (action.label) {
    case 'Link':
      return 'link text';
    case 'Code block':
      return 'code';
    default:
      return 'text';
  }
}
