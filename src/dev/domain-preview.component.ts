import { Component, signal } from '@angular/core';
import { CommentTreeComponent } from '../app/features/comments/comment-tree.component';
import { PostCardComponent } from '../app/features/feed/components/post-card.component';
import { buildCommentTree } from '../app/core/utils/comment-tree.builder';
import type { CommentFlatRow } from '../app/core/models/comment.model';
import type { PostSummary } from '../app/core/models/post.model';
import type { Profile, ProfileRow } from '../app/core/models/profile.model';
import { createEmptyUserReactions } from '../app/core/models/reaction.model';

const PROFILE_ROW: ProfileRow = {
  id: 'author-1',
  username: 'ada',
  full_name: 'Ada Lovelace',
  avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=ada',
  bio: 'First programmer.',
  website_url: '',
  github_username: '',
  twitter_username: '',
  created_at: '2024-01-04T10:00:00.000Z',
  updated_at: '2024-01-04T10:00:00.000Z',
};

const PROFILE: Profile = {
  id: PROFILE_ROW.id,
  username: PROFILE_ROW.username,
  fullName: PROFILE_ROW.full_name,
  avatarUrl: PROFILE_ROW.avatar_url,
  bio: PROFILE_ROW.bio ?? '',
  websiteUrl: '',
  githubUsername: '',
  twitterUsername: '',
  createdAt: PROFILE_ROW.created_at,
  updatedAt: PROFILE_ROW.updated_at,
};

/** Comment rows deliberately shuffled so depth resolution is order independent. */
const COMMENT_ROWS: CommentFlatRow[] = [
  {
    id: 'c-reply-deep',
    post_id: 'post-1',
    author_id: 'author-1',
    parent_id: 'c-reply',
    content_markdown: 'Deep reply',
    content_html: '<p>Deep reply</p>',
    is_deleted: false,
    likes_count: 0,
    created_at: '2024-05-02T10:03:00.000Z',
    updated_at: '2024-05-02T10:03:00.000Z',
    profiles: PROFILE_ROW,
  },
  {
    id: 'c-root',
    post_id: 'post-1',
    author_id: 'author-1',
    parent_id: null,
    content_markdown: 'Root comment',
    content_html: '<p>Root comment</p>',
    is_deleted: false,
    likes_count: 4,
    created_at: '2024-05-02T10:00:00.000Z',
    updated_at: '2024-05-02T10:00:00.000Z',
    profiles: PROFILE_ROW,
  },
  {
    id: 'c-reply',
    post_id: 'post-1',
    author_id: 'author-1',
    parent_id: 'c-root',
    content_markdown: 'First reply',
    content_html: '<p>First reply</p>',
    is_deleted: false,
    likes_count: 1,
    created_at: '2024-05-02T10:02:00.000Z',
    updated_at: '2024-05-02T10:02:00.000Z',
    profiles: PROFILE_ROW,
  },
  {
    id: 'c-second-root',
    post_id: 'post-1',
    author_id: 'author-1',
    parent_id: null,
    content_markdown: 'Second root',
    content_html: '<p>Second root</p>',
    is_deleted: true,
    likes_count: 0,
    created_at: '2024-05-02T10:01:00.000Z',
    updated_at: '2024-05-02T10:01:00.000Z',
    profiles: PROFILE_ROW,
  },
];

/**
 * Dev-only rendering of the feed and discussion components.
 *
 * Screens that require a signed-in visitor (the comment composer, the reaction
 * bar, the pages themselves) are exercised through the real application routes
 * instead of being stubbed here, so this harness stays credential free.
 */
@Component({
  selector: 'app-domain-preview',
  imports: [PostCardComponent, CommentTreeComponent],
  template: `
    <div class="max-w-3xl mx-auto p-4 space-y-8">
      <section data-testid="post-cards">
        <h2 class="text-lg font-bold mb-3">Post cards</h2>
        <app-post-card
          [post]="bookmarkedPost"
          [showCoverImage]="false"
          (bookmarkToggled)="bookmarkLog.set($event)"
          (reactionToggled)="reactionLog.set($event)"
          (tagSelected)="tagLog.set($event.name)"
        />
        <app-post-card [post]="plainPost" [showCoverImage]="true" />
        <p class="text-xs text-gray-500" data-testid="post-card-echo">
          bookmark: {{ bookmarkLog() || 'none' }} / reaction: {{ reactionLog() || 'none' }} / tag:
          {{ tagLog() || 'none' }}
        </p>
      </section>

      <section data-testid="comment-tree">
        <h2 class="text-lg font-bold mb-3">Comment tree ({{ depthReport() }})</h2>
        <app-comment-tree
          [comments]="comments"
          [currentUserId]="'author-1'"
          (likeToggled)="likeLog.set($event)"
          (deleteRequested)="deleteLog.set($event)"
        />
        <p class="text-xs text-gray-500" data-testid="comment-echo">
          like: {{ likeLog() || 'none' }} / delete: {{ deleteLog() || 'none' }}
        </p>
      </section>
    </div>
  `,
})
export class DomainPreviewComponent {
  protected readonly comments = buildCommentTree(COMMENT_ROWS, undefined, new Set<string>());

  protected readonly bookmarkLog = signal<string>('');
  protected readonly reactionLog = signal<string>('');
  protected readonly tagLog = signal<string>('');
  protected readonly likeLog = signal<string>('');
  protected readonly deleteLog = signal<string>('');

  protected readonly bookmarkedPost: PostSummary = {
    id: 'post-1',
    authorId: 'author-1',
    title: 'Signals changed how I structure components',
    slug: 'signals-changed-how-i-structure-components-1a2b',
    coverImageUrl: null,
    readingTimeMinutes: 6,
    published: true,
    reactionsCount: 42,
    commentsCount: 4,
    createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    author: PROFILE,
    tags: [
      {
        id: 't1',
        name: 'angular',
        displayName: 'Angular',
        hexColor: '#dd0031',
        bgColor: '#fff0f2',
        description: '',
        createdAt: '',
      },
      {
        id: 't2',
        name: 'webdev',
        displayName: 'WebDev',
        hexColor: '#3b49df',
        bgColor: '#eef0ff',
        description: '',
        createdAt: '',
      },
    ],
    userReactions: { ...createEmptyUserReactions(), bookmark: true },
  };

  protected readonly plainPost: PostSummary = {
    ...this.bookmarkedPost,
    id: 'post-2',
    title: 'A second card without a bookmark',
    slug: 'a-second-card-without-a-bookmark-9z8y',
    coverImageUrl: 'https://picsum.photos/seed/devto/1200/600',
    reactionsCount: 7,
    commentsCount: 0,
    userReactions: createEmptyUserReactions(),
  };

  /** Serialised tree shape, so the CDP check can verify nesting and depth. */
  protected depthReport(): string {
    const walk = (nodes: ReturnType<typeof buildCommentTree>): string =>
      nodes
        .map(
          (node) =>
            `${node.id}:d${node.depth}[${node.replies.map((child) => walk([child])).join('')}]`,
        )
        .join(' ');

    return walk(this.comments).trim();
  }
}
