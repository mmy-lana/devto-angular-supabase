import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../app/shared/ui/button/button.component';
import { CardComponent } from '../app/shared/ui/card/card.component';
import { AvatarComponent } from '../app/shared/ui/avatar/avatar.component';
import { BadgeComponent } from '../app/shared/ui/badge/badge.component';
import { IconComponent } from '../app/shared/ui/icon/icon.component';
import { InputComponent } from '../app/shared/ui/input/input.component';
import { TextareaComponent } from '../app/shared/ui/textarea/textarea.component';
import { CardSkeletonComponent } from '../app/shared/ui/skeleton/card-skeleton.component';
import { DetailSkeletonComponent } from '../app/shared/ui/skeleton/detail-skeleton.component';

@Component({
  selector: 'app-primitive-preview',
  imports: [
    FormsModule,
    ButtonComponent,
    CardComponent,
    AvatarComponent,
    BadgeComponent,
    IconComponent,
    InputComponent,
    TextareaComponent,
    CardSkeletonComponent,
    DetailSkeletonComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto p-4 space-y-8">
      <section>
        <h2 class="text-lg font-bold mb-3">Buttons</h2>
        <div class="flex flex-wrap items-center gap-3">
          <app-button variant="primary">Primary</app-button>
          <app-button variant="secondary">Secondary</app-button>
          <app-button variant="ghost">Ghost</app-button>
          <app-button variant="danger">Danger</app-button>
          <app-button variant="outline">Outline</app-button>
          <app-button variant="primary" size="sm">Small</app-button>
          <app-button variant="primary" size="lg">Large</app-button>
          <app-button variant="primary" [loading]="true">Loading</app-button>
          <app-button variant="outline" [disabled]="true">Disabled</app-button>
          <app-button variant="ghost" ariaLabel="Add reaction"><app-icon name="plus" size="sm" /></app-button>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-bold mb-3">Badges &amp; icons</h2>
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <app-badge variant="brand">Featured</app-badge>
          <app-badge variant="neutral">Draft</app-badge>
          <app-badge variant="success" [dot]="true">Published</app-badge>
          <app-badge variant="warning" [dot]="true">Pending</app-badge>
          <app-badge variant="danger">Failed</app-badge>
          <app-badge variant="outline" size="md">Outline md</app-badge>
        </div>
        <div class="flex flex-wrap items-center gap-4 text-gray-700">
          @for (icon of icons; track icon) {
            <span class="flex flex-col items-center gap-1 w-16">
              <app-icon [name]="icon" size="lg" />
              <span class="text-[10px] text-center">{{ icon }}</span>
            </span>
          }
        </div>
      </section>

      <section>
        <h2 class="text-lg font-bold mb-3">Cards &amp; avatars</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <app-card [hoverable]="true" padding="md">
            <div class="flex items-center gap-3">
              <app-avatar src="https://api.dicebear.com/7.x/bottts/svg?seed=ada" alt="Ada" size="lg" />
              <div>
                <p class="font-semibold text-sm">Ada Lovelace</p>
                <p class="text-xs text-gray-500">Jan 12 · 4 min read</p>
              </div>
            </div>
            <p class="mt-3 text-sm text-gray-700">Hoverable retro card body copy.</p>
          </app-card>
          <app-card padding="lg" [bordered]="false">
            <p class="text-sm">Borderless card with large padding.</p>
          </app-card>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-bold mb-3">Form controls (ngModel + signal)</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <app-input
            label="Email"
            type="email"
            placeholder="name@example.com"
            hint="We send a magic link, no password needed."
            icon="search"
            [(ngModel)]="email"
            name="email"
          />
          <app-input label="Username" placeholder="dev_writer" error="Username is already taken." />
          <app-input label="Disabled" [disabled]="true" value="locked" />
          <app-textarea
            label="Comment"
            placeholder="Share your thoughts"
            [rows]="3"
            [maxLength]="180"
            hint="Markdown supported."
            [(ngModel)]="comment"
            name="comment"
          />
          <app-textarea label="Invalid" error="Comment is required." />
        </div>
        <p class="mt-2 text-xs text-gray-500">model values → email: "{{ email() }}" / comment: "{{ comment() }}"</p>
      </section>

      <section>
        <h2 class="text-lg font-bold mb-3">Skeletons</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <app-card-skeleton [lines]="2" />
            <app-card-skeleton />
          </div>
          <app-detail-skeleton [lines]="6" />
        </div>
      </section>
    </div>
  `,
})
export class PrimitivePreviewComponent {
  readonly email = signal<string>('');
  readonly comment = signal<string>('');

  protected readonly icons = [
    'alert',
    'bell',
    'bookmark',
    'check',
    'chevron-down',
    'chevron-left',
    'close',
    'comment',
    'edit',
    'external-link',
    'github',
    'heart',
    'home',
    'link',
    'plus',
    'search',
    'share',
    'tag',
    'trash',
    'twitter',
    'user',
  ] as const;
}
