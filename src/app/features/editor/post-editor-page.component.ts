import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Tag } from '../../core/models/tag.model';
import { AuthService } from '../../core/services/auth.service';
import { PostService } from '../../core/services/post.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { createPendingTag, isPendingTag, TagService } from '../../core/services/tag.service';
import { toErrorMessage } from '../../core/utils/error-message.util';
import { MarkdownEditorComponent } from '../../shared/molecules/markdown-editor/markdown-editor.component';
import { TagSelectorChipsComponent } from './tag-selector-chips.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { InputComponent } from '../../shared/ui/input/input.component';

/** Longest accepted title, matching the DEV-style headline budget. */
const MAX_TITLE_LENGTH = 120;

/**
 * Post editor.
 *
 * Publishing resolves any newly typed tags first (creating them if needed), then
 * creates the post and navigates to it. Validation errors and service failures
 * are shown inline and the draft is kept, so a failed publish never loses work.
 */
@Component({
  selector: 'app-post-editor-page',
  imports: [
    RouterLink,
    FormsModule,
    MarkdownEditorComponent,
    TagSelectorChipsComponent,
    ButtonComponent,
    InputComponent,
  ],
  template: `
    <div class="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 class="text-sm font-bold text-gray-700 font-mono">Create Post</h1>

        <div class="flex items-center gap-2">
          <a routerLink="/">
            <app-button variant="ghost" size="md" [disabled]="publishing()">Cancel</app-button>
          </a>
          <app-button
            variant="primary"
            size="md"
            [loading]="publishing()"
            [disabled]="!canPublish()"
            (clicked)="publishPost()"
          >
            Publish
          </app-button>
        </div>
      </div>

      @if (errorMessage(); as error) {
        <div
          role="alert"
          class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {{ error }}
        </div>
      }

      @if (supabaseService.offlineModeSignal()) {
        <div
          role="status"
          class="mb-4 rounded-md border border-[#f0d28a] bg-[#fff8e5] px-4 py-3 text-xs text-[#7a5c04]"
        >
          <span class="font-bold">Offline / Sample Content Mode:</span> Publishing new posts is
          disabled while disconnected from Supabase. Connect an active database to publish articles.
        </div>
      }

      <div class="bg-white border border-[#d4d4d4] rounded-md p-4 sm:p-8 space-y-5 shadow-sm">
        <app-input
          label="Cover image URL"
          type="url"
          name="coverImageUrl"
          placeholder="https://example.com/cover.png"
          hint="Optional. Shown as a banner on the post page and in the feed."
          [(ngModel)]="coverImageUrl"
          [ngModelOptions]="{ standalone: true }"
          [maxLength]="500"
        />

        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1" for="post-title">
            Title
          </label>
          <input
            id="post-title"
            type="text"
            name="title"
            [value]="title()"
            [attr.maxlength]="maxTitleLength"
            placeholder="New post title here..."
            class="w-full text-2xl sm:text-4xl font-extrabold text-gray-900 placeholder-gray-300 border-0 border-b border-transparent focus:border-[#3b49df] focus:outline-none py-2"
            (input)="onTitleInput($event)"
          />
          <div class="flex items-center justify-between gap-2">
            @if (titleTouched() && title().trim().length < 5) {
              <p class="text-xs text-red-600">Titles need at least 5 characters.</p>
            } @else {
              <p class="text-xs text-gray-500">
                Write a specific title — it becomes the post's permanent link.
              </p>
            }
            <p class="text-xs text-gray-400 tabular-nums">
              {{ title().length }}/{{ maxTitleLength }}
            </p>
          </div>
        </div>

        <app-tag-selector-chips
          [availableTags]="tagService.tagsSignal()"
          [selectedTags]="selectedTags()"
          [maxTags]="maxTags"
          [loading]="tagService.loadingSignal()"
          [disabled]="publishing()"
          [error]="tagError()"
          (tagsChange)="onTagsChange($event)"
          (tagCreated)="onTagCreated($event)"
        />

        <app-markdown-editor
          [content]="markdownContent()"
          [rows]="14"
          (contentChange)="markdownContent.set($event)"
        />

        <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p class="text-xs text-gray-500">
            {{ readingTimeLabel() }} &bull; {{ wordCount() }} words
            @if (pendingTagCount() > 0) {
              &bull; {{ pendingTagCount() }} new tag{{ pendingTagCount() === 1 ? '' : 's' }} created on
              publish
            }
          </p>
          <div class="flex items-center gap-2">
            <a routerLink="/">
              <app-button variant="ghost" size="md" [disabled]="publishing()">Discard</app-button>
            </a>
            <app-button
              variant="primary"
              size="md"
              [loading]="publishing()"
              [disabled]="!canPublish()"
              (clicked)="publishPost()"
            >
              Publish
            </app-button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PostEditorPageComponent {
  private readonly postService = inject(PostService);
  protected readonly tagService = inject(TagService);
  protected readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly maxTags = 4;

  protected readonly title = signal<string>('');
  protected readonly coverImageUrl = signal<string>('');
  protected readonly markdownContent = signal<string>('');
  /** Chips shown in the selector, including not-yet-created ones. */
  protected readonly selectedTags = signal<Tag[]>([]);

  protected readonly publishing = signal<boolean>(false);
  protected readonly titleTouched = signal<boolean>(false);
  protected readonly errorMessage = signal<string>('');
  protected readonly tagError = signal<string>('');

  /** Tags that will be created when this post is published. */
  protected readonly pendingTagCount = computed(
    () => this.selectedTags().filter(isPendingTag).length,
  );

  protected readonly wordCount = () =>
    this.markdownContent().trim().length === 0
      ? 0
      : this.markdownContent().trim().split(/\s+/).length;

  protected readonly readingTimeLabel = () => {
    const words = this.wordCount();
    const minutes = Math.max(1, Math.ceil(words / 200));

    return `${minutes} min read`;
  };

  protected readonly canPublish = () =>
    this.title().trim().length >= 5 &&
    this.markdownContent().trim().length > 0 &&
    !this.publishing() &&
    !this.supabaseService.offlineModeSignal();

  constructor() {
    void this.tagService.fetchTags();
  }

  protected onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
    this.titleTouched.set(true);
  }

  protected onTagsChange(tags: Tag[]): void {
    this.selectedTags.set(tags);
    this.tagError.set('');
  }

  /**
   * Adds a tag the author typed but that does not exist yet.
   *
   * It is shown immediately as a placeholder chip and only written to the
   * database once the post is published, so abandoning a draft leaves no rows.
   */
  protected onTagCreated(name: string): void {
    this.tagError.set('');

    if (this.selectedTags().length >= this.maxTags) {
      this.tagError.set(`You can add up to ${this.maxTags} tags.`);

      return;
    }

    const pending = createPendingTag(name);

    if (this.selectedTags().some((tag) => tag.name === pending.name)) {
      return;
    }

    this.selectedTags.update((tags) => [...tags, pending]);
  }

  protected async publishPost(): Promise<void> {
    if (!this.canPublish()) {
      this.titleTouched.set(true);

      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.errorMessage.set('Sign in to publish a post.');
      this.authService.openAuthModal();

      return;
    }

    this.publishing.set(true);
    this.errorMessage.set('');
    this.tagError.set('');

    try {
      const tags = await this.tagService.resolveTags(
        Array.from(new Set(this.selectedTags().map((tag) => tag.name))),
      );

      const slug = await this.postService.createPost({
        title: this.title().trim(),
        contentMarkdown: this.markdownContent(),
        coverImageUrl: this.coverImageUrl().trim() || null,
        tagIds: tags.map((tag) => tag.id),
        published: true,
      });

      await this.router.navigate(['/post', slug]);
    } catch (error) {
      this.errorMessage.set(
        toErrorMessage(error, 'Could not publish your post. Your draft is still here.'),
      );
    } finally {
      this.publishing.set(false);
    }
  }
}
