import { Component, signal } from '@angular/core';
import { AuthorHeaderComponent } from '../app/shared/molecules/author-header/author-header.component';
import { MarkdownEditorComponent } from '../app/shared/molecules/markdown-editor/markdown-editor.component';
import { TagPillComponent } from '../app/shared/molecules/tag-pill/tag-pill.component';
import { FeedTabsComponent } from '../app/features/feed/components/feed-tabs.component';
import { TagSelectorChipsComponent } from '../app/features/editor/tag-selector-chips.component';
import { ButtonComponent } from '../app/shared/ui/button/button.component';
import type { FeedSortCriteria, FeedTimeRange } from '../app/core/models/post.model';
import type { Tag } from '../app/core/models/tag.model';
import type { Profile } from '../app/core/models/profile.model';

const TAGS: Tag[] = [
  { id: 't1', name: 'angular', displayName: 'Angular', hexColor: '#dd0031', bgColor: '#fff0f2', description: '', createdAt: '' },
  { id: 't2', name: 'typescript', displayName: 'TypeScript', hexColor: '#3178c6', bgColor: '#eef6ff', description: '', createdAt: '' },
  { id: 't3', name: 'supabase', displayName: 'Supabase', hexColor: '#3ecf8e', bgColor: '#eafaf2', description: '', createdAt: '' },
  { id: 't4', name: 'webdev', displayName: 'WebDev', hexColor: '#3b49df', bgColor: '#eef0ff', description: '', createdAt: '' },
  { id: 't5', name: 'tailwindcss', displayName: 'Tailwind CSS', hexColor: '#38bdf8', bgColor: '#eff9ff', description: '', createdAt: '' },
];

const AUTHOR: Profile = {
  id: 'p1',
  username: 'ada',
  fullName: 'Ada Lovelace',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=ada',
  bio: '',
  websiteUrl: '',
  githubUsername: '',
  twitterUsername: '',
  createdAt: '',
  updatedAt: '',
};

const SAMPLE_MARKDOWN = `## Why signals change everything

Angular signals remove the need for **manual subscriptions** in most components.

- fine grained updates
- \`computed\` caching
- less \`ChangeDetectorRef\`

\`\`\`ts
const count = signal(0);
\`\`\`

> Try the toolbar above.

[Read the docs](https://angular.dev)`;

/** Hostile body used to prove the sanitiser runs before rendering. */
const XSS_MARKDOWN = `# Hostile

<img src="x" onerror="window.__xss=1">

<script>window.__xss=1</script>

[link](javascript:window.__xss=1)`;

@Component({
  selector: 'app-molecule-preview',
  imports: [
    AuthorHeaderComponent,
    MarkdownEditorComponent,
    TagPillComponent,
    FeedTabsComponent,
    TagSelectorChipsComponent,
    ButtonComponent,
  ],
  template: `
    <div class="max-w-4xl mx-auto p-4 space-y-8">
      <section data-testid="feed-tabs">
        <h2 class="text-lg font-bold mb-3">Feed tabs</h2>
        <app-feed-tabs
          [currentSort]="sort()"
          [currentTimeRange]="timeRange()"
          (sortChange)="sort.set($event)"
          (timeRangeChange)="timeRange.set($event)"
        />
        <p class="text-xs text-gray-500" data-testid="feed-tabs-echo">
          sort: {{ sort() }} / range: {{ timeRange() }}
        </p>
      </section>

      <section data-testid="tag-pills">
        <h2 class="text-lg font-bold mb-3">Tag pills</h2>
        <div class="flex flex-wrap items-center">
          @for (tag of tags; track tag.id) {
            <app-tag-pill [tag]="tag" [selectable]="true" (selected)="lastSelectedTag.set($event.name)" />
          }
        </div>
        <div class="flex flex-wrap items-center mt-2">
          @for (tag of removableTags(); track tag.id) {
            <app-tag-pill [tag]="tag" [removable]="true" (removed)="removeTag($event)" />
          }
        </div>
        <p class="text-xs text-gray-500" data-testid="tag-echo">
          selected: {{ lastSelectedTag() || 'none' }} / removable left: {{ removableTags().length }}
        </p>
      </section>

      <section data-testid="author-headers">
        <h2 class="text-lg font-bold mb-3">Author headers</h2>
        <div class="space-y-2">
          <app-author-header [author]="author" [publishedAt]="threeHoursAgo" />
          <app-author-header [author]="author" [publishedAt]="lastYear" />
        </div>
      </section>

      <section data-testid="tag-selector">
        <h2 class="text-lg font-bold mb-3">Tag selector</h2>
        <app-tag-selector-chips
          [availableTags]="tags"
          [selectedTags]="selectedTags()"
          (tagsChange)="selectedTags.set($event)"
          (tagCreated)="createdTag.set($event)"
        />
        <p class="text-xs text-gray-500" data-testid="tag-selector-echo">
          selected: {{ selectedNames() }} / created: {{ createdTag() || 'none' }}
        </p>
      </section>

      <section data-testid="markdown-editor">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Markdown editor</h2>
          <app-button size="sm" variant="outline" (clicked)="loadSample()">Load sample</app-button>
          <app-button size="sm" variant="danger" (clicked)="loadHostile()">Load hostile</app-button>
        </div>
        <app-markdown-editor
          [content]="markdown()"
          [rows]="10"
          (contentChange)="markdown.set($event)"
        />
        <p class="text-xs text-gray-500 mt-2" data-testid="editor-echo">length: {{ markdown().length }}</p>
      </section>
    </div>
  `,
})
export class MoleculePreviewComponent {
  protected readonly tags = TAGS;
  protected readonly author = AUTHOR;

  protected readonly sort = signal<FeedSortCriteria>('relevant');
  protected readonly timeRange = signal<FeedTimeRange>('week');
  protected readonly lastSelectedTag = signal<string>('');
  protected readonly removableTags = signal<Tag[]>([TAGS[0], TAGS[1]]);
  protected readonly selectedTags = signal<Tag[]>([TAGS[0]]);
  protected readonly createdTag = signal<string>('');
  protected readonly markdown = signal<string>('');

  protected readonly threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
  protected readonly lastYear = new Date(Date.now() - 400 * 86_400_000).toISOString();

  protected selectedNames(): string {
    return this.selectedTags().map((tag) => tag.name).join(', ') || 'none';
  }

  protected removeTag(tag: Tag): void {
    this.removableTags.update((tags) => tags.filter((candidate) => candidate.id !== tag.id));
  }

  protected loadSample(): void {
    this.markdown.set(SAMPLE_MARKDOWN);
  }

  protected loadHostile(): void {
    this.markdown.set(XSS_MARKDOWN);
  }
}
