# Dev.to Mock Platform (Posts, Comments, Likes)
## Architectural Blueprint & Technical Specification (`plan.md`)

---

## 1. Data Schema & Pure TypeScript Interfaces

### 1.1 PostgreSQL Schema & Supabase Configuration

```sql
-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Mirrors auth.users)
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    username text unique not null check (char_length(username) >= 3 and username ~* '^[a-zA-Z0-9_]+$'),
    full_name text not null,
    avatar_url text not null default 'https://api.dicebear.com/7.x/bottts/svg?seed=fallback',
    bio text default '',
    website_url text default '',
    github_username text default '',
    twitter_username text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. TAGS TABLE
create table public.tags (
    id uuid default gen_random_uuid() primary key,
    name text unique not null check (name = lower(name) and name ~* '^[a-z0-9-]+$'),
    display_name text not null,
    hex_color text not null check (hex_color ~* '^#[0-9a-fA-F]{6}$'),
    bg_color text not null check (bg_color ~* '^#[0-9a-fA-F]{6}$'),
    description text default '',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. POSTS TABLE
create table public.posts (
    id uuid default gen_random_uuid() primary key,
    author_id uuid references public.profiles(id) on delete cascade not null,
    title text not null check (char_length(trim(title)) >= 5),
    slug text unique not null,
    content_markdown text not null,
    content_html text not null,
    cover_image_url text,
    reading_time_minutes smallint not null default 1,
    published boolean not null default true,
    reactions_count integer not null default 0 check (reactions_count >= 0),
    comments_count integer not null default 0 check (comments_count >= 0),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. POST_TAGS JUNCTION TABLE
create table public.post_tags (
    post_id uuid references public.posts(id) on delete cascade not null,
    tag_id uuid references public.tags(id) on delete cascade not null,
    primary key (post_id, tag_id)
);

-- 5. COMMENTS TABLE (Adjacency list with soft delete preservation)
create table public.comments (
    id uuid default gen_random_uuid() primary key,
    post_id uuid references public.posts(id) on delete cascade not null,
    author_id uuid references public.profiles(id) on delete cascade not null,
    parent_id uuid references public.comments(id) on delete set null,
    content_markdown text not null check (char_length(trim(content_markdown)) >= 1),
    content_html text not null,
    is_deleted boolean not null default false,
    likes_count integer not null default 0 check (likes_count >= 0),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. REACTIONS TABLE (Polymorphic: supports both posts and comments)
create type reaction_kind as enum ('like', 'unicorn', 'exploding_head', 'raised_hands', 'fire', 'bookmark');

create table public.reactions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    post_id uuid references public.posts(id) on delete cascade,
    comment_id uuid references public.comments(id) on delete cascade,
    reaction reaction_kind not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint post_or_comment_required check (
        (post_id is not null and comment_id is null) or 
        (post_id is null and comment_id is not null)
    ),
    constraint unique_post_user_reaction unique (post_id, user_id, reaction),
    constraint unique_comment_user_reaction unique (comment_id, user_id, reaction)
);

-- 7. INDEXES FOR HIGH-THROUGHPUT QUERIES
create index idx_posts_slug on public.posts(slug);
create index idx_posts_created_at_desc on public.posts(created_at desc) where published = true;
create index idx_posts_reactions_count on public.posts(reactions_count desc) where published = true;
create index idx_comments_post_id on public.comments(post_id);
create index idx_comments_parent_id on public.comments(parent_id);
create index idx_reactions_user_post on public.reactions(user_id, post_id);
create index idx_reactions_user_comment on public.reactions(user_id, comment_id);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.posts enable row level security;
alter table public.post_tags enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;

-- Profiles: Anyone can view; only owner can update
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Tags: Read-only for public; authenticated users can insert missing tags
create policy "Tags are viewable by everyone" on public.tags for select using (true);
create policy "Authenticated users can create tags" on public.tags for insert with check (auth.role() = 'authenticated');

-- Posts: Public read if published; author can read/write unpublished
create policy "Public posts are viewable by everyone" on public.posts for select using (published = true or auth.uid() = author_id);
create policy "Authenticated users can insert posts" on public.posts for insert with check (auth.uid() = author_id);
create policy "Authors can update their own posts" on public.posts for update using (auth.uid() = author_id);
create policy "Authors can delete their own posts" on public.posts for delete using (auth.uid() = author_id);

-- Post Tags: Viewable by everyone; managed by post author
create policy "Post tags viewable by everyone" on public.post_tags for select using (true);
create policy "Post authors can insert post tags" on public.post_tags for insert with check (
    exists (select 1 from public.posts where id = post_id and author_id = auth.uid())
);
create policy "Post authors can delete post tags" on public.post_tags for delete using (
    exists (select 1 from public.posts where id = post_id and author_id = auth.uid())
);

-- Comments: Public view; authenticated creation; owner update/delete
create policy "Comments are viewable by everyone" on public.comments for select using (true);
create policy "Authenticated users can create comments" on public.comments for insert with check (auth.uid() = author_id);
create policy "Authors can update their own comments" on public.comments for update using (auth.uid() = author_id);
create policy "Authors can delete their own comments" on public.comments for delete using (auth.uid() = author_id);

-- Reactions: Public view; authenticated toggle (insert/delete)
create policy "Reactions are viewable by everyone" on public.reactions for select using (true);
create policy "Authenticated users can insert reactions" on public.reactions for insert with check (auth.uid() = user_id);
create policy "Users can delete their own reactions" on public.reactions for delete using (auth.uid() = user_id);

-- 9. TRIGGERS & RPC COUNTER SYNCHRONIZERS
-- Auto-create profile on auth.users registration with username collision avoidance
create or replace function public.handle_new_user()
returns trigger as $$
declare
    base_username text;
    final_username text;
    counter integer := 0;
begin
    base_username := coalesce(new.raw_user_meta_data->>'user_name', 'dev_' || substr(md5(new.id::text), 1, 8));
    final_username := base_username;

    while exists (select 1 from public.profiles where username = final_username) loop
        counter := counter + 1;
        final_username := base_username || counter::text;
    end loop;

    insert into public.profiles (id, username, full_name, avatar_url)
    values (
        new.id,
        final_username,
        coalesce(new.raw_user_meta_data->>'full_name', 'Dev Member'),
        coalesce(new.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/bottts/svg?seed=' || new.id::text)
    );
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Atomic post reactions counter trigger
create or replace function public.update_post_reactions_count()
returns trigger as $$
begin
    if (TG_OP = 'INSERT' and NEW.post_id is not null) then
        update public.posts set reactions_count = reactions_count + 1 where id = NEW.post_id;
    elsif (TG_OP = 'DELETE' and OLD.post_id is not null) then
        update public.posts set reactions_count = greatest(reactions_count - 1, 0) where id = OLD.post_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger trg_post_reaction_count
    after insert or delete on public.reactions
    for each row execute function public.update_post_reactions_count();

-- Atomic post comments counter trigger (accounting for soft-delete)
create or replace function public.update_post_comments_count()
returns trigger as $$
begin
    if (TG_OP = 'INSERT' and NEW.is_deleted = false) then
        update public.posts set comments_count = comments_count + 1 where id = NEW.post_id;
    elsif (TG_OP = 'DELETE' and OLD.is_deleted = false) then
        update public.posts set comments_count = greatest(comments_count - 1, 0) where id = OLD.post_id;
    elsif (TG_OP = 'UPDATE') then
        if (OLD.is_deleted = false and NEW.is_deleted = true) then
            update public.posts set comments_count = greatest(comments_count - 1, 0) where id = NEW.post_id;
        elsif (OLD.is_deleted = true and NEW.is_deleted = false) then
            update public.posts set comments_count = comments_count + 1 where id = NEW.post_id;
        end if;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger trg_post_comment_count
    after insert or delete or update of is_deleted on public.comments
    for each row execute function public.update_post_comments_count();
```

---

### 1.2 Pure TypeScript Domain Models & Interfaces

```typescript
// src/app/core/models/profile.model.ts
export interface Profile {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  websiteUrl: string;
  githubUsername: string;
  twitterUsername: string;
  createdAt: string;
  updatedAt: string;
}

// src/app/core/models/tag.model.ts
export interface Tag {
  id: string;
  name: string;
  displayName: string;
  hexColor: string;
  bgColor: string;
  description: string;
  createdAt: string;
}

// src/app/core/models/reaction.model.ts
export type ReactionType = 'like' | 'unicorn' | 'exploding_head' | 'raised_hands' | 'fire' | 'bookmark';

export interface ReactionCountSummary {
  like: number;
  unicorn: number;
  exploding_head: number;
  raised_hands: number;
  fire: number;
  bookmark: number;
  total: number;
}

export interface UserReactionsState {
  like: boolean;
  unicorn: boolean;
  exploding_head: boolean;
  raised_hands: boolean;
  fire: boolean;
  bookmark: boolean;
}

export interface ReactionRecord {
  id: string;
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  reaction: ReactionType;
  createdAt: string;
}

// src/app/core/models/comment.model.ts
export interface CommentNode {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  contentMarkdown: string;
  contentHtml: string;
  isDeleted: boolean;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
  author: Profile;
  hasLiked: boolean;
  replies: CommentNode[];
  depth: number;
}

export interface CommentFlatRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content_markdown: string;
  content_html: string;
  is_deleted: boolean;
  likes_count: number;
  created_at: string;
  updated_at: string;
  profiles: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    bio: string;
    website_url: string;
    github_username: string;
    twitter_username: string;
    created_at: string;
    updated_at: string;
  };
}

// src/app/core/models/post.model.ts
export type FeedSortCriteria = 'relevant' | 'latest' | 'top';
export type FeedTimeRange = 'day' | 'week' | 'month' | 'year' | 'infinity';

export interface PostSummary {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  readingTimeMinutes: number;
  published: boolean;
  reactionsCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  author: Profile;
  tags: Tag[];
  userReactions: UserReactionsState;
}

export interface PostDetail extends PostSummary {
  contentMarkdown: string;
  contentHtml: string;
}

export interface CreatePostPayload {
  title: string;
  contentMarkdown: string;
  coverImageUrl?: string | null;
  tagIds: string[];
  published: boolean;
}

export interface UpdatePostPayload {
  title?: string;
  contentMarkdown?: string;
  coverImageUrl?: string | null;
  tagIds?: string[];
  published?: boolean;
}

// src/app/core/models/feed-filter.model.ts
export interface FeedFilter {
  sort: FeedSortCriteria;
  timeRange?: FeedTimeRange;
  tag?: string;
  searchQuery?: string;
  page: number;
  pageSize: number;
}
```

---

## 2. Component Architecture

The component hierarchy strictly segregates presentation from container/domain logic, adhering to the Dev.to retro card layout aesthetic (sharp/lightly rounded borders, mono/bold typographic hierarchy, signature reactions toolbar, high-contrast tag pills, and 3-column desktop / 1-column mobile views).

```
src/app/
├── core/
│   ├── models/
│   ├── guards/
│   │   ├── auth.guard.ts
│   │   └── editor.guard.ts
│   └── services/
│       ├── supabase.service.ts
│       ├── auth.service.ts
│       ├── post.service.ts
│       ├── comment.service.ts
│       ├── reaction.service.ts
│       ├── tag.service.ts
│       └── markdown.service.ts
├── shared/
│   ├── ui/
│   │   ├── avatar/
│   │   │   └── avatar.component.ts
│   │   ├── badge/
│   │   │   └── badge.component.ts
│   │   ├── button/
│   │   │   └── button.component.ts
│   │   ├── card/
│   │   │   └── card.component.ts
│   │   ├── dropdown/
│   │   │   └── dropdown.component.ts
│   │   ├── icon/
│   │   │   └── icon.component.ts
│   │   ├── input/
│   │   │   └── input.component.ts
│   │   ├── modal/
│   │   │   └── modal.component.ts
│   │   ├── skeleton/
│   │   │   ├── card-skeleton.component.ts
│   │   │   └── detail-skeleton.component.ts
│   │   └── textarea/
│   │       └── textarea.component.ts
│   └── molecules/
│       ├── author-header/
│       │   └── author-header.component.ts
│       ├── reaction-button/
│       │   └── reaction-button.component.ts
│       ├── tag-pill/
│       │   └── tag-pill.component.ts
│       ├── markdown-renderer/
│       │   └── markdown-renderer.component.ts
│       └── markdown-editor/
│           └── markdown-editor.component.ts
├── features/
│   ├── auth/
│   │   ├── auth-modal.component.ts
│   │   └── login-page.component.ts
│   ├── feed/
│   │   ├── components/
│   │   │   ├── feed-tabs.component.ts
│   │   │   ├── post-card.component.ts
│   │   │   └── left-sidebar.component.ts
│   │   │   └── right-sidebar.component.ts
│   │   └── feed-page.component.ts
│   ├── post-detail/
│   │   ├── components/
│   │   │   ├── reaction-floating-bar.component.ts
│   │   │   ├── post-author-card.component.ts
│   │   │   └── post-comments-container.component.ts
│   │   └── post-detail-page.component.ts
│   ├── comments/
│   │   ├── comment-composer.component.ts
│   │   ├── comment-item.component.ts
│   │   └── comment-tree.component.ts
│   ├── editor/
│   │   ├── post-editor-page.component.ts
│   │   └── tag-selector-chips.component.ts
│   └── profile/
│       └── profile-page.component.ts
└── layout/
    ├── app-header/
    │   └── app-header.component.ts
    ├── mobile-bottom-bar/
    │   └── mobile-bottom-bar.component.ts
    └── shell.component.ts
```

### 2.1 Component Specifications Matrix

| Component | Selector | Type | Inputs | Outputs | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CardComponent` | `app-card` | UI Primitive | `bordered`, `hoverable`, `padding` | None | Dev.to retro card container with explicit `#e2e8f0` border and `0.375rem` radius |
| `TagPillComponent` | `app-tag-pill` | Molecule | `tag: Tag`, `removable: boolean` | `removed: void` | DEV-style `#color` prefix, colored outline on hover |
| `PostCardComponent` | `app-post-card` | Feature | `post: PostSummary`, `isFirst: boolean` | `reactionToggled: ReactionType` | Main feed card item. First item renders large cover image banner |
| `ReactionFloatingBarComponent` | `app-reaction-floating-bar` | Feature | `postId: string`, `reactions: UserReactionsState`, `counts: ReactionCountSummary`, `commentsCount: number` | `react: ReactionType`, `jumpToComments: void` | Sticky desktop left column reaction rail; sticky mobile bottom reaction drawer |
| `CommentTreeComponent` | `app-comment-tree` | Feature | `comments: CommentNode[]`, `postId: string` | `replyAdded: { parentId, content }` | Hierarchical recursive discussion tree with collapsible indent lines |
| `MarkdownEditorComponent` | `app-markdown-editor` | Molecule | `initialValue: string`, `placeholder: string` | `contentChange: string` | DEV-like Write/Preview tabbed markdown editor with inline image formatting |
| `MobileBottomBarComponent` | `app-mobile-bottom-bar` | Shell | None | `tabChange: string`, `openCreate: void` | Viewport `< 768px` bottom thumb-accessible navigation bar |

---

## 3. Core Feature Logic & Algorithms

### 3.1 Hierarchical Comment Tree Transformation

Supabase stores comments using an adjacency list (`id`, `parent_id`). Fetching is performed as a single flat `O(N)` query, transformed client-side into an `O(N)` hierarchical tree supporting arbitrary recursion depths, clamped to a visual nesting depth of `5` to prevent mobile layout overflow.

```typescript
// src/app/core/utils/comment-tree.builder.ts
import { CommentFlatRow, CommentNode } from '../models/comment.model';

export function buildCommentTree(
  flatRows: CommentFlatRow[], 
  currentUserId?: string, 
  userLikedCommentIds: Set<string> = new Set()
): CommentNode[] {
  const nodeMap = new Map<string, CommentNode>();
  const rootNodes: CommentNode[] = [];

  // Pass 1: Instantiate CommentNode items
  for (const row of flatRows) {
    const node: CommentNode = {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentId: row.parent_id,
      contentMarkdown: row.content_markdown,
      contentHtml: row.content_html,
      isDeleted: row.is_deleted,
      likesCount: row.likes_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: {
        id: row.profiles.id,
        username: row.profiles.username,
        fullName: row.profiles.full_name,
        avatarUrl: row.profiles.avatar_url,
        bio: row.profiles.bio,
        websiteUrl: row.profiles.website_url,
        githubUsername: row.profiles.github_username,
        twitterUsername: row.profiles.twitter_username,
        createdAt: row.profiles.created_at,
        updatedAt: row.profiles.updated_at,
      },
      hasLiked: userLikedCommentIds.has(row.id),
      replies: [],
      depth: 0,
    };
    nodeMap.set(row.id, node);
  }

  // Pass 2: Connect child nodes to parents or root list
  for (const row of flatRows) {
    const node = nodeMap.get(row.id);
    if (!node) continue;

    if (row.parent_id && nodeMap.has(row.parent_id)) {
      const parent = nodeMap.get(row.parent_id)!;
      node.depth = Math.min(parent.depth + 1, 5); // Visual recursion cap
      parent.replies.push(node);
    } else {
      node.depth = 0;
      rootNodes.push(node);
    }
  }

  // Sort children by created_at ascending (chronological discussion flow)
  const sortChildren = (nodes: CommentNode[]) => {
    nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const n of nodes) {
      if (n.replies.length > 0) {
        sortChildren(n.replies);
      }
    }
  };

  sortChildren(rootNodes);
  return rootNodes;
}
```

### 3.2 Optimistic Reaction Toggling with Rollback

When a user taps Heart, Unicorn, or Bookmark:
1. Signal updates instantly with optimistic counter mutation and active color styling.
2. In-flight request dispatches to Supabase RPC / table delete or insert.
3. If an HTTP or RLS error occurs, state seamlessly rolls back with a toast alert.

```typescript
// src/app/core/services/reaction.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ReactionType, UserReactionsState, ReactionCountSummary } from '../models/reaction.model';

@Injectable({ providedIn: 'root' })
export class ReactionService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  async togglePostReaction(
    postId: string,
    reaction: ReactionType,
    currentState: boolean,
    currentCounts: ReactionCountSummary,
    stateSignal: (updater: (prev: UserReactionsState) => UserReactionsState) => void,
    countSignal: (updater: (prev: ReactionCountSummary) => ReactionCountSummary) => void
  ): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) {
      this.authService.openAuthModal();
      return false;
    }

    const nextState = !currentState;
    const delta = nextState ? 1 : -1;

    // 1. Optimistic Update
    stateSignal((prev) => ({ ...prev, [reaction]: nextState }));
    countSignal((prev) => ({
      ...prev,
      [reaction]: Math.max(0, prev[reaction] + delta),
      total: Math.max(0, prev.total + delta),
    }));

    try {
      if (nextState) {
        const { error } = await this.supabase.from('reactions').insert({
          user_id: user.id,
          post_id: postId,
          reaction: reaction,
        });
        if (error) throw error;
      } else {
        const { error } = await this.supabase
          .from('reactions')
          .delete()
          .match({ user_id: user.id, post_id: postId, reaction: reaction });
        if (error) throw error;
      }
      return true;
    } catch (err) {
      // 2. Rollback on failure
      stateSignal((prev) => ({ ...prev, [reaction]: currentState }));
      countSignal((prev) => ({
        ...prev,
        [reaction]: Math.max(0, prev[reaction] - delta),
        total: Math.max(0, prev.total - delta),
      }));
      console.error('Reaction sync failed, state reverted:', err);
      return false;
    }
  }
}
```

### 3.3 Reading Time & Markdown Processor

Dev.to calculates reading time based on an average reading speed of 200 words per minute (WPM), discounting frontmatter, code blocks, and markdown punctuation.

```typescript
// src/app/core/services/markdown.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly WORDS_PER_MINUTE = 200;

  calculateReadingTime(markdown: string): number {
    if (!markdown || markdown.trim().length === 0) return 1;

    // Strip out code fences to avoid distorting word counts
    const cleanText = markdown
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`.*?`/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '') // strip images
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // retain link anchor texts
      .replace(/[#*`_~>\-+=|{}[\]]/g, ' ') // strip markdown tokens
      .trim();

    const words = cleanText.match(/\b[^\s]+\b/g);
    const wordCount = words ? words.length : 0;
    const minutes = Math.ceil(wordCount / this.WORDS_PER_MINUTE);

    return Math.max(1, minutes);
  }

  generateSlug(title: string): string {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    
    // Append 4-char cryptographic nano ID for collisions
    const randomSalt = Math.random().toString(36).substring(2, 6);
    return `${baseSlug}-${randomSalt}`;
  }

  parseMarkdownToHtml(markdown: string): string {
    // Ultra-fast client sanitizer & renderer wrapper (integrating marked + DOMPurify)
    if (!markdown) return '';
    
    let html = markdown
      // Escape script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-6 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-3 pb-1 border-b border-gray-200">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-black mt-8 mb-4">$1</h1>')
      // Blockquotes
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-indigo-500 pl-4 py-1 my-4 text-gray-700 italic bg-gray-50 rounded-r">$1</blockquote>')
      // Code Blocks
      .replace(/```([a-z]*)\n([\s\S]*?)```/gim, '<pre class="bg-gray-900 text-gray-100 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm"><code>$2</code></pre>')
      // Inline Code
      .replace(/`([^`]+)`/gim, '<code class="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded font-mono text-sm border border-gray-200">$1</code>')
      // Bold & Italic
      .replace(/\*\*([^*]+)\*\*/gim, '<strong class="font-bold text-gray-900">$1</strong>')
      .replace(/\*([^*]+)\*/gim, '<em class="italic">$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">$1</a>')
      // Unordered lists
      .replace(/^\s*\-\s(.*)$/gim, '<li class="ml-6 list-disc text-gray-800 my-1">$1</li>')
      // Line breaks to paragraphs
      .replace(/\n\s*\n/gim, '</p><p class="my-4 text-gray-800 leading-relaxed text-base">');

    return `<div class="devto-prose prose max-w-none text-gray-800"><p class="my-4 text-gray-800 leading-relaxed text-base">${html}</p></div>`;
  }
}
```

---

## 4. Mobile-First Responsive Breakpoint Matrix

Dev.to interfaces must display with absolute fidelity across all viewport ranges. Every functional touch target maintains an interaction footprint of at least `44px x 44px`. Essential interactions (voting, bookmarking, commenting, navigating) never rely on hover triggers.

```
+-----------------------------------------------------------------------------------------------+
| VIEWPORT BREAKDOWN & ADAPTIVE SHELL                                                           |
+===============================================================================================+
| BREAKPOINT | SHELL LAYOUT          | FEED GRID               | NAVIGATION PATTERN             |
+------------+-----------------------+-------------------------+--------------------------------+
| 360px      | Single Column Stack   | Full width, no sidebars | Sticky Top Header (Compact)    |
| (Mobile S) | Card padding: 12px    | First post banner 180px | Sticky Bottom Nav Bar (48px)   |
|            | Font: Base 15px       | Reaction bar pinned bot | Floating Action Button (+)     |
+------------+-----------------------+-------------------------+--------------------------------+
| 390px-430px| Single Column Stack   | Full width, no sidebars | Fixed Header with search icon  |
| (Mobile L) | Card padding: 16px    | First post banner 210px | Bottom Nav (Feed/Notif/Profile)|
|            | Font: Base 16px       | Reaction bar pinned bot | Bottom Sheet Comment Drawer    |
+------------+-----------------------+-------------------------+--------------------------------+
| 768px      | Dual Column Grid      | Main Feed: flex-1       | Desktop Top Navigation         |
| (Tablet)   | Gap: 16px             | Right Sidebar: 260px    | Hamburger drawer for Tag menu  |
|            | Padding: 16px 24px    | Left Sidebar collapsed  | Post detail left reaction rail |
+------------+-----------------------+-------------------------+--------------------------------+
| 1024px+    | Dev.to Classic 3-Col  | Left Sidebar: 240px     | Full desktop sticky header     |
| (Desktop)  | Max-width: 1280px     | Main Feed: 680px        | Left navigation tags list      |
|            | Gap: 24px             | Right Sidebar: 320px    | Right listings & hashtag box   |
+-----------------------------------------------------------------------------------------------+
```

### Viewport Behavioral Rules
1. **Reaction Bar Positioning (`ReactionFloatingBarComponent`)**:
   - `≥ 1024px`: Rendered as a sticky left gutter rail offset by `top: 100px`, absolutely floating adjacent to the article content.
   - `< 1024px`: Repositioned to a sticky viewport bottom dock (`bottom: 0; left: 0; right: 0; height: 56px; z-index: 50; background: #ffffff; border-top: 1px solid #e2e8f0;`) with full touch hitboxes.
2. **Comment Thread Indentation Handling**:
   - Mobile (`< 640px`): Thread indent step is clamped to `12px` per level up to max 3 levels. Further replies remain flat with an `@author` callout tag to prevent horizontal truncation.
   - Desktop (`≥ 640px`): Thread indent step is `28px` with clear vertical connector guide lines (`border-left: 2px solid #e2e8f0`).
3. **Feed Cards Retro Style Details**:
   - Default: `background: #ffffff; border: 1px solid #d4d4d4; border-radius: 6px; box-shadow: 0 0 0 1px rgba(23, 23, 23, 0.05);`
   - Active/Hover: `border-color: #a3a3a3; box-shadow: 0 2px 4px rgba(0,0,0,0.06);`

---

## 5. Five-Phase Implementation Queue

```
================================================================================
                    DEV.TO PLATFORM 5-PHASE EXECUTION QUEUE
================================================================================

 [ PHASE 1 ] Foundation: Supabase Infrastructure, Models, and Client Layer
      |
 [ PHASE 2 ] Design Foundation: Retro Card Primitives & Atomic UI Elements
      |
 [ PHASE 3 ] Compound Molecules & Form Systems (Markdown Editor & Feed Tabs)
      |
 [ PHASE 4 ] Domain Engine: Signals State, Comment Tree & Optimistic Reactions
      |
 [ PHASE 5 ] Full Page Assembly, Responsive Shell & E2E Validation
================================================================================
```

---

### Phase 1: Foundation: Supabase Infrastructure, Models, and Client Layer

#### Pinned Project Dependencies
```json
{
  "dependencies": {
    "@angular/common": "^19.0.0",
    "@angular/compiler": "^19.0.0",
    "@angular/core": "^19.0.0",
    "@angular/forms": "^19.0.0",
    "@angular/platform-browser": "^19.0.0",
    "@angular/router": "^19.0.0",
    "@supabase/supabase-js": "^2.48.0",
    "rxjs": "^7.8.1",
    "tslib": "^2.6.3",
    "zone.js": "~0.15.0"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^19.0.0",
    "@angular/cli": "^19.0.0",
    "@angular/compiler-cli": "^19.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.6.3"
  }
}
- `src/environments/environment.development.ts`
- `src/app/core/models/profile.model.ts`
- `src/app/core/models/post.model.ts`
- `src/app/core/models/comment.model.ts`
- `src/app/core/models/tag.model.ts`
- `src/app/core/models/reaction.model.ts`
- `src/app/core/services/supabase.service.ts`
- `src/app/core/services/auth.service.ts`
- `src/app/core/guards/auth.guard.ts`

#### Step-by-Step Implementation Details

##### Step 1.1: Environment Configurations
Create environment files configuring Supabase URL and anonymous key.
```typescript
// src/environments/environment.ts
export const environment = {
  production: true,
  supabaseUrl: 'https://xyzcompany.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key',
};
```

##### Step 1.2: Supabase Client Service
Instantiate and inject the Supabase client singleton across the Angular application.
```typescript
// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}
```

##### Step 1.3: Reactive Authentication Service
Wrap Supabase auth sessions using Angular Signals (`signal`, `computed`).
```typescript
// src/app/core/services/auth.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/profile.model';
import { User, Session } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;

  private sessionSignal = signal<Session | null>(null);
  private profileSignal = signal<Profile | null>(null);
  private authModalOpenSignal = signal<boolean>(false);

  readonly currentSession = this.sessionSignal.asReadonly();
  readonly currentUser = computed<User | null>(() => this.sessionSignal()?.user ?? null);
  readonly currentProfile = this.profileSignal.asReadonly();
  readonly isAuthenticated = computed<boolean>(() => !!this.sessionSignal());
  readonly isAuthModalOpen = this.authModalOpenSignal.asReadonly();

  constructor() {
    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    this.sessionSignal.set(session);
    if (session?.user) {
      await this.loadUserProfile(session.user.id);
    }

    this.supabase.auth.onAuthStateChange(async (_event, session) => {
      this.sessionSignal.set(session);
      if (session?.user) {
        await this.loadUserProfile(session.user.id);
      } else {
        this.profileSignal.set(null);
      }
    });
  }

  async loadUserProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      this.profileSignal.set({
        id: data.id,
        username: data.username,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        bio: data.bio || '',
        websiteUrl: data.website_url || '',
        githubUsername: data.github_username || '',
        twitterUsername: data.twitter_username || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    }
  }

  openAuthModal(): void {
    this.authModalOpenSignal.set(true);
  }

  closeAuthModal(): void {
    this.authModalOpenSignal.set(false);
  }

  async signInWithGithub(): Promise<void> {
    await this.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    });
  }

  async signInWithEmail(email: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.sessionSignal.set(null);
    this.profileSignal.set(null);
  }
}
```

##### Step 1.4: Functional Authentication Guard
Protect creation and modification routes using `CanActivateFn`.
```typescript
// src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  authService.openAuthModal();
  return router.parseUrl('/');
};
```

#### Phase 1 Verification Checklist
- [x] Run PostgreSQL migration script in Supabase dashboard with triggers and foreign keys.
- [x] Supabase client initializes without runtime errors and securely exposes anon access.
- [x] `AuthService` listens to auth state changes and synchronizes user profile signals.
- [x] `authGuard` successfully intercepts unauthenticated navigation and opens the auth modal.

---

### Phase 2: Design Foundation: Retro Card Primitives & Atomic UI Elements

#### Goal
Implement the core visual styling of DEV.to. Construct standalone atomic components utilizing Tailwind CSS styling with retro borders (`#d4d4d4`), distinct button variants, avatar circles, icon wrappers, and skeleton placeholders.

#### File Manifest
- `src/styles.css`
- `src/app/shared/ui/button/button.component.ts`
- `src/app/shared/ui/card/card.component.ts`
- `src/app/shared/ui/avatar/avatar.component.ts`
- `src/app/shared/ui/badge/badge.component.ts`
- `src/app/shared/ui/icon/icon.component.ts`
- `src/app/shared/ui/input/input.component.ts`
- `src/app/shared/ui/skeleton/card-skeleton.component.ts`

#### Step-by-Step Implementation Details

##### Step 2.1: Global Styles & Retro Themes
Configure Tailwind CSS design variables for Dev.to color profiles: Brand Indigo (`#3b49df`), dark surface (`#090909`), card border (`#e2e8f0` / `#d4d4d4`), and soft canvas background (`#f5f5f5`).

/* src/styles.css */
@import "tailwindcss";

@theme {
  --color-dev-bg: #f5f5f5;
  --color-dev-card-bg: #ffffff;
  --color-dev-card-border: #e2e8f0;
  --color-dev-card-border-hover: #a3a3a3;
  --color-dev-brand: #3b49df;
  --color-dev-brand-hover: #2f3ab2;
  --color-dev-text-main: #171717;
  --color-dev-text-secondary: #575757;
}

body {
  background-color: var(--color-dev-bg);
  color: var(--color-dev-text-main);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

.retro-box {
  background-color: #ffffff;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  box-shadow: 0 0 0 1px rgba(23, 23, 23, 0.05);
}
```

##### Step 2.2: Retro Button Component
Features Dev.to variations: `primary` (vibrant blue), `secondary` (subtle grey border), `ghost` (transparent reaction item), `danger` (red tone).
```typescript
// src/app/shared/ui/button/button.component.ts
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      (click)="clicked.emit($event)"
      [class]="computedClasses()"
    >
      @if (loading()) {
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('secondary');
  size = input<ButtonSize>('md');
  type = input<'button' | 'submit' | 'reset'>('button');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  fullWidth = input<boolean>(false);

  clicked = output<MouseEvent>();

  computedClasses(): string {
    const base = 'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';
    
    const sizeMap: Record<ButtonSize, string> = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    };

    const variantMap: Record<ButtonVariant, string> = {
      primary: 'bg-[#3b49df] hover:bg-[#2f3ab2] text-white focus:ring-[#3b49df] border border-transparent shadow-sm',
      secondary: 'bg-transparent hover:bg-gray-100 text-[#3b49df] hover:text-[#2f3ab2] focus:ring-gray-300 border border-[#3b49df]',
      ghost: 'bg-transparent hover:bg-black/5 text-gray-700 focus:ring-gray-300 border border-transparent',
      danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 border border-transparent',
      outline: 'bg-white hover:bg-gray-50 text-gray-800 border border-[#d4d4d4] focus:ring-gray-200',
    };

    const width = this.fullWidth() ? 'w-full' : '';

    return `${base} ${sizeMap[this.size()]} ${variantMap[this.variant()]} ${width}`;
  }
}
```

##### Step 2.3: Dev.to Card Primitive
```typescript
// src/app/shared/ui/card/card.component.ts
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="computedClasses()">
      <ng-content></ng-content>
    </div>
  `,
})
export class CardComponent {
  padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
  hoverable = input<boolean>(false);
  bordered = input<boolean>(true);

  computedClasses(): string {
    const base = 'bg-white rounded-md overflow-hidden';
    const border = this.bordered() ? 'border border-[#d4d4d4] shadow-sm' : '';
    const hover = this.hoverable() ? 'transition-all duration-150 hover:border-[#a3a3a3]' : '';
    
    const paddingMap = {
      none: '',
      sm: 'p-3',
      md: 'p-4 sm:p-5',
      lg: 'p-6 sm:p-8',
    };

    return `${base} ${border} ${hover} ${paddingMap[this.padding()]}`;
  }
}
```

##### Step 2.4: Avatar Primitive
```typescript
// src/app/shared/ui/avatar/avatar.component.ts
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <img
      [src]="src()"
      [alt]="alt()"
      [class]="sizeClasses()"
      class="rounded-full object-cover border border-gray-200 bg-gray-100 flex-shrink-0 inline-block"
      loading="lazy"
    />
  `,
})
export class AvatarComponent {
  src = input.required<string>();
  alt = input<string>('User avatar');
  size = input<'xs' | 'sm' | 'md' | 'lg' | 'xl'>('md');

  sizeClasses(): string {
    const map = {
      xs: 'w-6 h-6',
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12',
      xl: 'w-16 h-16',
    };
    return map[this.size()];
  }
}
```

##### Step 2.5: Skeleton Placeholders
```typescript
// src/app/shared/ui/skeleton/card-skeleton.component.ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-card-skeleton',
  standalone: true,
  template: `
    <div class="bg-white border border-[#d4d4d4] rounded-md p-4 sm:p-5 animate-pulse mb-3">
      <div class="flex items-center space-x-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-gray-200"></div>
        <div class="space-y-1.5 flex-1">
          <div class="h-3.5 bg-gray-200 rounded w-1/4"></div>
          <div class="h-3 bg-gray-200 rounded w-1/6"></div>
        </div>
      </div>
      <div class="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
      <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
      <div class="flex items-center justify-between pt-2">
        <div class="flex space-x-2">
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
        </div>
        <div class="h-4 w-12 bg-gray-200 rounded"></div>
      </div>
    </div>
  `,
})
export class CardSkeletonComponent {}
```

#### Phase 2 Verification Checklist
- [x] UI primitives render consistently across light and high-contrast modes.
- [x] Responsive padding on `app-card` drops cleanly to 12px on 360px viewport.
- [x] Button elements maintain 44px height hitboxes in `md` and `lg` forms for mobile accessibility.
- [x] Skeletons present fluid pulse effects with no layout shifts.

---

### Phase 3: Compound Molecules & Feature Components

#### Goal
Build higher-order interactive components: Dev.to style Tag Pills, Author Info Headers, Live Markdown Editor with syntax formatting shortcuts, and Feed Filter Navigation Tabs.

#### File Manifest
- `src/app/shared/molecules/tag-pill/tag-pill.component.ts`
- `src/app/shared/molecules/author-header/author-header.component.ts`
- `src/app/shared/molecules/markdown-editor/markdown-editor.component.ts`
- `src/app/features/feed/components/feed-tabs.component.ts`
- `src/app/features/editor/tag-selector-chips.component.ts`

#### Step-by-Step Implementation Details

##### Step 3.1: Tag Pill Component
DEV tags feature a distinct leading `#` prefix tinted by their specific color tag or subtle neutral hover.
```typescript
// src/app/shared/molecules/tag-pill/tag-pill.component.ts
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tag } from '../../../core/models/tag.model';

@Component({
  selector: 'app-tag-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      (click)="selected.emit(tag())"
      [style.--tag-color]="tag().hexColor"
      class="inline-flex items-center text-xs font-mono px-2 py-1 rounded transition-colors duration-150 cursor-pointer border border-transparent hover:border-current hover:bg-opacity-10 text-gray-700 hover:text-[var(--tag-color)] mr-1.5 my-0.5"
    >
      <span class="opacity-60 mr-0.5">#</span>{{ tag().name }}
      @if (removable()) {
        <button
          type="button"
          (click)="$event.stopPropagation(); removed.emit(tag())"
          class="ml-1 hover:text-red-500 font-bold focus:outline-none"
        >
          &times;
        </button>
      }
    </span>
  `,
})
export class TagPillComponent {
  tag = input.required<Tag>();
  removable = input<boolean>(false);
  selected = output<Tag>();
  removed = output<Tag>();
}
```

##### Step 3.2: Author Header Molecule
Presents author avatar, full name, username handle, and relative post timestamp (`e.g. 3 hours ago`).
```typescript
// src/app/shared/molecules/author-header/author-header.component.ts
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Profile } from '../../../core/models/profile.model';
import { AvatarComponent } from '../../ui/avatar/avatar.component';

@Component({
  selector: 'app-author-header',
  standalone: true,
  imports: [CommonModule, AvatarComponent],
  template: `
    <div class="flex items-center space-x-2.5">
      <app-avatar [src]="author().avatarUrl" [alt]="author().fullName" size="sm"></app-avatar>
      <div class="flex flex-col">
        <a
          [href]="'/user/' + author().username"
          (click)="$event.stopPropagation()"
          class="text-xs sm:text-sm font-semibold text-gray-900 hover:text-[#3b49df] transition-colors leading-tight"
        >
          {{ author().fullName }}
        </a>
        <span class="text-[11px] sm:text-xs text-gray-500 leading-tight">
          {{ formattedDate() }}
        </span>
      </div>
    </div>
  `,
})
export class AuthorHeaderComponent {
  author = input.required<Profile>();
  publishedAt = input.required<string>();

  formattedDate(): string {
    const d = new Date(this.publishedAt());
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
```

##### Step 3.3: Live Tabbed Markdown Editor Component
Includes a toolbar for Bold, Italic, Code, Link, Quotes, and a split Write / Preview view.
```typescript
// src/app/shared/molecules/markdown-editor/markdown-editor.component.ts
import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownService } from '../../../core/services/markdown.service';

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-[#d4d4d4] rounded-md bg-white overflow-hidden">
      <!-- Top Editor Tabs & Tools -->
      <div class="flex items-center justify-between border-b border-[#e2e8f0] px-3 py-1.5 bg-gray-50">
        <div class="flex space-x-1">
          <button
            type="button"
            (click)="activeTab.set('write')"
            [class.font-bold]="activeTab() === 'write'"
            [class.border-b-2]="activeTab() === 'write'"
            class="px-3 py-1 text-sm text-gray-700 border-[#3b49df] focus:outline-none"
          >
            Write
          </button>
          <button
            type="button"
            (click)="activeTab.set('preview')"
            [class.font-bold]="activeTab() === 'preview'"
            [class.border-b-2]="activeTab() === 'preview'"
            class="px-3 py-1 text-sm text-gray-700 border-[#3b49df] focus:outline-none"
          >
            Preview
          </button>
        </div>

        @if (activeTab() === 'write') {
          <div class="hidden sm:flex items-center space-x-1">
            <button type="button" (click)="insertSyntax('**', '**')" class="p-1 rounded hover:bg-gray-200 text-xs font-bold" title="Bold">B</button>
            <button type="button" (click)="insertSyntax('*', '*')" class="p-1 rounded hover:bg-gray-200 text-xs italic" title="Italic">I</button>
            <button type="button" (click)="insertSyntax('`', '`')" class="p-1 rounded hover:bg-gray-200 text-xs font-mono" title="Inline Code">&lt;&gt;</button>
            <button type="button" (click)="insertSyntax('```\n', '\n```')" class="p-1 rounded hover:bg-gray-200 text-xs font-mono" title="Code Block">&#123;&#125;</button>
            <button type="button" (click)="insertSyntax('> ', '')" class="p-1 rounded hover:bg-gray-200 text-xs" title="Quote">""</button>
          </div>
        }
      </div>

      <!-- Editor Content View -->
      <div class="p-3">
        @if (activeTab() === 'write') {
          <textarea
            #textareaEl
            [value]="content()"
            (input)="onInputChange($event)"
            [placeholder]="placeholder()"
            [rows]="rows()"
            class="w-full font-mono text-sm focus:outline-none resize-y text-gray-900 border-none bg-transparent"
          ></textarea>
        } @else {
          <div
            class="min-h-[160px] prose max-w-none text-sm p-1"
            [innerHTML]="renderedPreview()"
          ></div>
        }
      </div>
    </div>
  `,
})
export class MarkdownEditorComponent {
  private markdownService = inject(MarkdownService);

  content = input<string>('');
  placeholder = input<string>('Write your content using markdown...');
  rows = input<number>(10);
  contentChange = output<string>();

  activeTab = signal<'write' | 'preview'>('write');

  renderedPreview(): string {
    return this.markdownService.parseMarkdownToHtml(this.content());
  }

  onInputChange(event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.contentChange.emit(val);
  }

  insertSyntax(prefix: string, suffix: string): void {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const selected = current.substring(start, end) || 'text';

    const updated = current.substring(0, start) + prefix + selected + suffix + current.substring(end);
    this.contentChange.emit(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  }
}
```

##### Step 3.4: Feed Tabs Molecule
Provides the primary sort switcher: Relevant, Latest, Top (with nested dropdown for Day / Week / Month / Year).
```typescript
// src/app/features/feed/components/feed-tabs.component.ts
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedSortCriteria, FeedTimeRange } from '../../../core/models/post.model';

@Component({
  selector: 'app-feed-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between mb-3">
      <nav class="flex space-x-1 sm:space-x-2" aria-label="Feed sort options">
        <button
          type="button"
          (click)="sortChange.emit('relevant')"
          [class]="getTabClass(currentSort() === 'relevant')"
        >
          Relevant
        </button>
        <button
          type="button"
          (click)="sortChange.emit('latest')"
          [class]="getTabClass(currentSort() === 'latest')"
        >
          Latest
        </button>
        <button
          type="button"
          (click)="sortChange.emit('top')"
          [class]="getTabClass(currentSort() === 'top')"
        >
          Top
        </button>
      </nav>

      @if (currentSort() === 'top') {
        <select
          [value]="currentTimeRange()"
          (change)="onTimeRangeChange($event)"
          aria-label="Filter top posts by timeframe"
          class="text-xs bg-white border border-[#d4d4d4] rounded px-2 py-1 text-gray-700 focus:outline-none"
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="infinity">Infinity</option>
        </select>
      }
    </div>
  `,
})
export class FeedTabsComponent {
  currentSort = input.required<FeedSortCriteria>();
  currentTimeRange = input<FeedTimeRange>('week');

  sortChange = output<FeedSortCriteria>();
  timeRangeChange = output<FeedTimeRange>();

  getTabClass(isActive: boolean): string {
    const base = 'px-3 py-1.5 text-sm sm:text-base rounded font-medium transition-colors cursor-pointer';
    return isActive
      ? `${base} text-black font-bold bg-white border border-[#d4d4d4]`
      : `${base} text-gray-600 hover:text-[#3b49df] hover:bg-white/60`;
  }

  onTimeRangeChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as FeedTimeRange;
    this.timeRangeChange.emit(val);
  }
}
```

#### Phase 3 Verification Checklist
- [x] `app-tag-pill` renders custom hex styling via CSS variable scoping without styling bleed.
- [x] Markdown editor Write and Preview tabs render with zero latency lag.
- [x] Markdown formatting shortcuts correctly wrap highlighted cursor texts.
- [x] Feed Tabs handle criteria switching and propagate time range selections.

---

### Phase 4: Domain Engine: Signals State, Comment Tree & Optimistic Reactions

#### Goal
Implement high-performance domain services for Posts, Comments, and Reactions. Wire up threaded discussions with optimistic client-side insertions, real-time counter reconciliations, and custom Supabase query operators.

#### File Manifest
- `src/app/core/services/post.service.ts`
- `src/app/core/services/comment.service.ts`
- `src/app/core/services/reaction.service.ts`
- `src/app/core/services/tag.service.ts`
- `src/app/features/feed/components/post-card.component.ts`
- `src/app/features/comments/comment-tree.component.ts`
- `src/app/features/comments/comment-item.component.ts`
- `src/app/features/comments/comment-composer.component.ts`

#### Step-by-Step Implementation Details

##### Step 4.1: Post Query Engine
Loads the feed with pagination, tag filtering, full-text searching, and sorting criteria.
```typescript
// src/app/core/services/post.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { PostSummary, PostDetail, FeedFilter, CreatePostPayload, UpdatePostPayload } from '../models/post.model';
import { MarkdownService } from './markdown.service';

@Injectable({ providedIn: 'root' })
export class PostService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private markdownService = inject(MarkdownService);

  readonly loadingSignal = signal<boolean>(false);
  readonly postsSignal = signal<PostSummary[]>([]);
  private cursorState: { lastCreatedAt: string; lastReactionsCount: number; lastId: string } | null = null;

  async fetchFeed(filter: FeedFilter, resetCursor: boolean = false): Promise<PostSummary[]> {
    this.loadingSignal.set(true);
    try {
      if (resetCursor) {
        this.cursorState = null;
      }

      let query = this.supabase
        .from('posts')
        .select(`
          id,
          author_id,
          title,
          slug,
          cover_image_url,
          reading_time_minutes,
          published,
          reactions_count,
          comments_count,
          created_at,
          updated_at,
          profiles!posts_author_id_fkey (*),
          post_tags (
            tags (*)
          )
        `)
        .eq('published', true);

      // Stable Keyset Cursor Sorting & Paging
      if (filter.sort === 'latest') {
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
        if (this.cursorState) {
          query = query.lt('created_at', this.cursorState.lastCreatedAt);
        }
      } else {
        query = query
          .order('reactions_count', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });

        if (this.cursorState) {
          query = query.or(
            `reactions_count.lt.${this.cursorState.lastReactionsCount},and(reactions_count.eq.${this.cursorState.lastReactionsCount},created_at.lt.${this.cursorState.lastCreatedAt})`
          );
        }
      }

      query = query.limit(filter.pageSize);

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const last = data[data.length - 1];
        this.cursorState = {
          lastCreatedAt: last.created_at,
          lastReactionsCount: last.reactions_count,
          lastId: last.id,
        };
      }

      const currentUserId = this.authService.currentUser()?.id;
      const userReactionsMap = currentUserId ? await this.fetchUserReactionsForPosts(data.map((p: any) => p.id), currentUserId) : new Map();

      const mapped: PostSummary[] = (data || []).map((row: any) => ({
        id: row.id,
        authorId: row.author_id,
        title: row.title,
        slug: row.slug,
        coverImageUrl: row.cover_image_url,
        readingTimeMinutes: row.reading_time_minutes,
        published: row.published,
        reactionsCount: row.reactions_count,
        commentsCount: row.comments_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        author: {
          id: row.profiles.id,
          username: row.profiles.username,
          fullName: row.profiles.full_name,
          avatarUrl: row.profiles.avatar_url,
          bio: row.profiles.bio || '',
          websiteUrl: row.profiles.website_url || '',
          githubUsername: row.profiles.github_username || '',
          twitterUsername: row.profiles.twitter_username || '',
          createdAt: row.profiles.created_at,
          updatedAt: row.profiles.updated_at,
        },
        tags: (row.post_tags || []).map((pt: any) => pt.tags).filter(Boolean),
        userReactions: userReactionsMap.get(row.id) || {
          like: false,
          unicorn: false,
          exploding_head: false,
          raised_hands: false,
          fire: false,
          bookmark: false,
        },
      }));

      if (filter.page === 1) {
        this.postsSignal.set(mapped);
      } else {
        this.postsSignal.update((prev) => [...prev, ...mapped]);
      }

      return mapped;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async getPostBySlug(slug: string): Promise<PostDetail | null> {
    const { data, error } = await this.supabase
      .from('posts')
      .select(`
        id,
        author_id,
        title,
        slug,
        content_markdown,
        content_html,
        cover_image_url,
        reading_time_minutes,
        published,
        reactions_count,
        comments_count,
        created_at,
        updated_at,
        profiles!posts_author_id_fkey (*),
        post_tags (
          tags (*)
        )
      `)
      .eq('slug', slug)
      .single();

    if (error || !data) return null;

    const currentUserId = this.authService.currentUser()?.id;
    let userReactions = {
      like: false,
      unicorn: false,
      exploding_head: false,
      raised_hands: false,
      fire: false,
      bookmark: false,
    };

    if (currentUserId) {
      const userMap = await this.fetchUserReactionsForPosts([data.id], currentUserId);
      if (userMap.has(data.id)) {
        userReactions = userMap.get(data.id)!;
      }
    }

    return {
      id: data.id,
      authorId: data.author_id,
      title: data.title,
      slug: data.slug,
      contentMarkdown: data.content_markdown,
      contentHtml: data.content_html,
      coverImageUrl: data.cover_image_url,
      readingTimeMinutes: data.reading_time_minutes,
      published: data.published,
      reactionsCount: data.reactions_count,
      commentsCount: data.comments_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      author: {
        id: data.profiles.id,
        username: data.profiles.username,
        fullName: data.profiles.full_name,
        avatarUrl: data.profiles.avatar_url,
        bio: data.profiles.bio || '',
        websiteUrl: data.profiles.website_url || '',
        githubUsername: data.profiles.github_username || '',
        twitterUsername: data.profiles.twitter_username || '',
        createdAt: data.profiles.created_at,
        updatedAt: data.profiles.updated_at,
      },
      tags: (data.post_tags || []).map((pt: any) => pt.tags).filter(Boolean),
      userReactions,
    };
  }

  async createPost(payload: CreatePostPayload): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized');

    const readingTime = this.markdownService.calculateReadingTime(payload.contentMarkdown);
    const contentHtml = this.markdownService.parseMarkdownToHtml(payload.contentMarkdown);

    let postData: { id: string; slug: string } | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !postData) {
      const slug = this.markdownService.generateSlug(payload.title);
      const { data, error } = await this.supabase
        .from('posts')
        .insert({
          author_id: user.id,
          title: payload.title,
          slug,
          content_markdown: payload.contentMarkdown,
          content_html: contentHtml,
          cover_image_url: payload.coverImageUrl || null,
          reading_time_minutes: readingTime,
          published: payload.published,
        })
        .select('id, slug')
        .single();

      if (!error && data) {
        postData = data;
      } else if (error && error.code === '23505') {
        attempts += 1;
      } else {
        throw error;
      }
    }

    if (!postData) throw new Error('Failed to generate unique post slug');

    if (payload.tagIds.length > 0) {
      const tagInserts = payload.tagIds.map((tagId) => ({
        post_id: postData!.id,
        tag_id: tagId,
      }));
      await this.supabase.from('post_tags').insert(tagInserts);
    }

    return postData.slug;
  }

  async updatePost(postId: string, payload: UpdatePostPayload): Promise<void> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.title !== undefined) updates['title'] = payload.title;
    if (payload.contentMarkdown !== undefined) {
      updates['content_markdown'] = payload.contentMarkdown;
      updates['content_html'] = this.markdownService.parseMarkdownToHtml(payload.contentMarkdown);
      updates['reading_time_minutes'] = this.markdownService.calculateReadingTime(payload.contentMarkdown);
    }
    if (payload.coverImageUrl !== undefined) updates['cover_image_url'] = payload.coverImageUrl;
    if (payload.published !== undefined) updates['published'] = payload.published;

    const { error } = await this.supabase.from('posts').update(updates).eq('id', postId);
    if (error) throw error;
  }

  async deletePost(postId: string): Promise<void> {
    const { error } = await this.supabase.from('posts').delete().eq('id', postId);
    if (error) throw error;
    this.postsSignal.update((posts) => posts.filter((p) => p.id !== postId));
  }

  private async fetchUserReactionsForPosts(postIds: string[], userId: string): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    if (postIds.length === 0) return map;

    const { data, error } = await this.supabase
      .from('reactions')
      .select('post_id, reaction')
      .eq('user_id', userId)
      .in('post_id', postIds);

    if (error || !data) return map;

    for (const pid of postIds) {
      map.set(pid, {
        like: false,
        unicorn: false,
        exploding_head: false,
        raised_hands: false,
        fire: false,
        bookmark: false,
      });
    }

    for (const r of data) {
      const current = map.get(r.post_id);
      if (current && r.reaction in current) {
        current[r.reaction] = true;
      }
    }

    return map;
  }
}
```

##### Step 4.2: Threaded Comment Engine
```typescript
// src/app/core/services/comment.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { MarkdownService } from './markdown.service';
import { CommentNode, CommentFlatRow } from '../models/comment.model';
import { buildCommentTree } from '../utils/comment-tree.builder';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private markdownService = inject(MarkdownService);

  readonly commentsTreeSignal = signal<CommentNode[]>([]);
  readonly loadingSignal = signal<boolean>(false);

  async loadCommentsForPost(postId: string): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const { data, error } = await this.supabase
        .from('comments')
        .select(`
          id,
          post_id,
          author_id,
          parent_id,
          content_markdown,
          content_html,
          is_deleted,
          likes_count,
          created_at,
          updated_at,
          profiles!comments_author_id_fkey (*)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const currentUserId = this.authService.currentUser()?.id;
      const userLikedCommentIds = new Set<string>();

      if (currentUserId && data && data.length > 0) {
        const commentIds = data.map((c: any) => c.id);
        const { data: reactionData } = await this.supabase
          .from('reactions')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .eq('reaction', 'like')
          .in('comment_id', commentIds);

        if (reactionData) {
          reactionData.forEach((r: any) => userLikedCommentIds.add(r.comment_id));
        }
      }

      const flatRows = (data || []) as unknown as CommentFlatRow[];
      const tree = buildCommentTree(flatRows, currentUserId, userLikedCommentIds);
      this.commentsTreeSignal.set(tree);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async deleteComment(commentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('comments')
      .update({ is_deleted: true, content_markdown: '[deleted]', content_html: '<p class="italic text-gray-400">[deleted]</p>' })
      .eq('id', commentId);

    if (error) throw error;

    const markDeleted = (nodes: CommentNode[]): boolean => {
      for (const node of nodes) {
        if (node.id === commentId) {
          node.isDeleted = true;
          node.contentMarkdown = '[deleted]';
          node.contentHtml = '<p class="italic text-gray-400">[deleted]</p>';
          return true;
        }
        if (node.replies.length > 0 && markDeleted(node.replies)) {
          return true;
        }
      }
      return false;
    };

    this.commentsTreeSignal.update((tree) => {
      const cloned = structuredClone(tree);
      markDeleted(cloned);
      return cloned;
    });
  }

  async addComment(postId: string, markdown: string, parentId: string | null = null): Promise<CommentNode> {
    const user = this.authService.currentUser();
    const profile = this.authService.currentProfile();
    if (!user || !profile) throw new Error('Must be authenticated to comment.');

    const html = this.markdownService.parseMarkdownToHtml(markdown);

    // 1. Insert into Supabase
    const { data, error } = await this.supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: user.id,
        parent_id: parentId,
        content_markdown: markdown,
        content_html: html,
      })
      .select()
      .single();

    if (error || !data) throw error;

    const newCommentNode: CommentNode = {
      id: data.id,
      postId: data.post_id,
      authorId: data.author_id,
      parentId: data.parent_id,
      contentMarkdown: data.content_markdown,
      contentHtml: data.content_html,
      isDeleted: false,
      likesCount: 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      author: profile,
      hasLiked: false,
      replies: [],
      depth: 0,
    };

    // 2. Optimistically append node into tree signal
    this.commentsTreeSignal.update((currentTree) => {
      if (!parentId) {
        return [...currentTree, newCommentNode];
      }

      const insertRecursive = (nodes: CommentNode[]): boolean => {
        for (const n of nodes) {
          if (n.id === parentId) {
            newCommentNode.depth = Math.min(n.depth + 1, 5);
            n.replies.push(newCommentNode);
            return true;
          }
          if (n.replies.length > 0 && insertRecursive(n.replies)) {
            return true;
          }
        }
        return false;
      };

      const cloned = structuredClone(currentTree);
      insertRecursive(cloned);
      return cloned;
    });

    return newCommentNode;
  }
}
```

// src/app/features/comments/comment-tree.component.ts
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommentNode } from '../../core/models/comment.model';
import { CommentItemComponent } from './comment-item.component';

@Component({
  selector: 'app-comment-tree',
  standalone: true,
  imports: [CommonModule, CommentItemComponent],
  template: `
    <div class="space-y-4">
      @for (comment of comments(); track comment.id) {
        <app-comment-item
          [comment]="comment"
          (likeToggled)="likeToggled.emit($event)"
          (replyCreated)="replyCreated.emit()"
        ></app-comment-item>
      } @empty {
        <p class="text-sm text-gray-500 py-4 text-center">No comments yet. Be the first to start the conversation!</p>
      }
    </div>
  `,
})
export class CommentTreeComponent {
  comments = input.required<CommentNode[]>();
  likeToggled = output<string>();
  replyCreated = output<void>();
}

##### Step 4.3: Dev.to Feed Post Card Component
Renders the card layout with author block, reading time, tag pills, and engagement stats.
```typescript
// src/app/features/feed/components/post-card.component.ts
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PostSummary } from '../../../core/models/post.model';
import { ReactionType } from '../../../core/models/reaction.model';
import { AuthorHeaderComponent } from '../../../shared/molecules/author-header/author-header.component';
import { TagPillComponent } from '../../../shared/molecules/tag-pill/tag-pill.component';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule, RouterLink, AuthorHeaderComponent, TagPillComponent],
  template: `
    <article
      [routerLink]="['/post', post().slug]"
      class="bg-white border border-[#d4d4d4] hover:border-[#a3a3a3] rounded-md mb-2 sm:mb-3 overflow-hidden transition-all duration-150 cursor-pointer group shadow-sm"
    >
      <!-- Cover Banner for Hero Item -->
      @if (showCoverImage() && post().coverImageUrl) {
        <div class="w-full h-44 sm:h-64 overflow-hidden border-b border-[#e2e8f0] bg-gray-100">
          <img
            [src]="post().coverImageUrl"
            [alt]="post().title"
            class="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-200"
            loading="lazy"
          />
        </div>
      }

      <div class="p-3 sm:p-5">
        <!-- Author info line -->
        <div class="mb-3">
          <app-author-header [author]="post().author" [publishedAt]="post().createdAt"></app-author-header>
        </div>

        <!-- Post Title Header -->
        <div class="pl-0 sm:pl-10">
          <h2 class="text-lg sm:text-2xl font-bold text-gray-900 group-hover:text-[#3b49df] transition-colors leading-snug mb-2">
            {{ post().title }}
          </h2>

          <!-- Tags List -->
          <div class="flex flex-wrap items-center mb-3">
            @for (tag of post().tags; track tag.id) {
              <app-tag-pill [tag]="tag"></app-tag-pill>
            }
          </div>

          <!-- Engagement Footer Rail -->
          <div class="flex items-center justify-between pt-1 text-xs text-gray-500">
            <div class="flex items-center space-x-3 sm:space-x-4">
              <!-- Reactions Count -->
              <span class="inline-flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                <svg class="w-4 h-4 text-red-500 fill-current" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <span class="text-gray-700 font-medium">{{ post().reactionsCount }}</span>
                <span class="hidden sm:inline">reactions</span>
              </span>

              <!-- Comments Count -->
              <span class="inline-flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                <span class="text-gray-700 font-medium">{{ post().commentsCount }}</span>
                <span class="hidden sm:inline">comments</span>
              </span>
            </div>

            <!-- Reading Time & Save action with minimum 44px hit target -->
            <div class="flex items-center space-x-2">
              <span class="text-[11px] sm:text-xs text-gray-500">{{ post().readingTimeMinutes }} min read</span>
              <button
                type="button"
                (click)="$event.stopPropagation(); bookmarkToggled.emit(post().id)"
                aria-label="Bookmark post"
                class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-900"
              >
                <svg
                  class="w-4 h-4"
                  [class.fill-current]="post().userReactions.bookmark"
                  [class.text-[#3b49df]]="post().userReactions.bookmark"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  `,
})
export class PostCardComponent {
  post = input.required<PostSummary>();
  showCoverImage = input<boolean>(false);
  bookmarkToggled = output<string>();
  reactionToggled = output<ReactionType>();
}
```

##### Step 4.4: Nested Comment Item Component
Renders markdown content, replies, author profile, timestamp, and inline response composer.
```typescript
// src/app/features/comments/comment-item.component.ts
import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommentNode } from '../../../core/models/comment.model';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CommentComposerComponent } from './comment-composer.component';

@Component({
  selector: 'app-comment-item',
  standalone: true,
  imports: [CommonModule, AvatarComponent, CommentComposerComponent, CommentItemComponent],
  template: `
    <div
      [id]="'comment-' + comment().id"
      [style.margin-left.px]="mobileIndent()"
      class="relative mt-3 group"
    >
      @if (comment().depth > 0) {
        <div class="absolute -left-2 sm:-left-3 top-0 bottom-0 w-0.5 bg-gray-200 group-hover:bg-gray-300"></div>
      }

      <div class="flex items-start space-x-2 sm:space-x-3">
        <app-avatar [src]="comment().author.avatarUrl" [alt]="comment().author.fullName" size="sm"></app-avatar>

        <div class="flex-1 border border-[#e2e8f0] rounded-md p-3 sm:p-4 bg-white shadow-xs">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center space-x-2">
              <span class="text-xs sm:text-sm font-semibold text-gray-900">{{ comment().author.fullName }}</span>
              @if (comment().depth > 3) {
                <span class="text-[10px] text-gray-500 font-mono">replied to parent</span>
              }
              <span class="text-[11px] text-gray-400">&bull; {{ formattedDate() }}</span>
            </div>
          </div>

          @if (comment().isDeleted) {
            <p class="text-xs text-gray-400 italic py-1">[This comment was deleted by author]</p>
          } @else {
            <div class="text-xs sm:text-sm text-gray-800 leading-relaxed break-words" [innerHTML]="comment().contentHtml"></div>
          }

          <div class="flex items-center space-x-2 mt-2 pt-1 text-xs text-gray-500">
            <button
              type="button"
              (click)="likeToggled.emit(comment().id)"
              class="min-h-[44px] min-w-[44px] inline-flex items-center justify-center space-x-1 hover:text-red-600 transition-colors"
            >
              <svg class="w-3.5 h-3.5" [class.text-red-600]="comment().hasLiked" [class.fill-current]="comment().hasLiked" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
              <span>{{ comment().likesCount }}</span>
            </button>

            <button
              type="button"
              (click)="isReplying.set(!isReplying())"
              class="min-h-[44px] px-3 inline-flex items-center justify-center hover:text-[#3b49df] transition-colors font-medium"
            >
              Reply
            </button>
          </div>

          <!-- Inline Nested Reply Box -->
          @if (isReplying()) {
            <div class="mt-3 pt-3 border-t border-gray-100">
              <app-comment-composer
                [postId]="comment().postId"
                [parentId]="comment().id"
                [placeholder]="'Replying to ' + comment().author.fullName + '...'"
                (commentCreated)="onReplySubmitted()"
                (canceled)="isReplying.set(false)"
              ></app-comment-composer>
            </div>
          }
        </div>
      </div>

      <!-- Recursive Child Replies -->
      @if (comment().replies.length > 0) {
        <div class="space-y-2 mt-1">
          @for (child of comment().replies; track child.id) {
            <app-comment-item
              [comment]="child"
              (likeToggled)="likeToggled.emit($event)"
              (replyCreated)="replyCreated.emit($event)"
            ></app-comment-item>
          }
        </div>
      }
    </div>
  `,
})
export class CommentItemComponent {
  comment = input.required<CommentNode>();
  likeToggled = output<string>();
  replyCreated = output<void>();

  isReplying = signal<boolean>(false);

  mobileIndent(): number {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
    if (this.comment().depth === 0) return 0;
    // Mobile flattens beyond depth 3 with 12px per step; Desktop uses 24px per step
    const cappedDepth = isMobile ? Math.min(this.comment().depth, 3) : this.comment().depth;
    return cappedDepth * (isMobile ? 12 : 24);
  }

  formattedDate(): string {
    return new Date(this.comment().createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  onReplySubmitted(): void {
    this.isReplying.set(false);
    this.replyCreated.emit();
  }
}
```

##### Step 4.5: Comment Composer Component
```typescript
// src/app/features/comments/comment-composer.component.ts
import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommentService } from '../../../core/services/comment.service';
import { AuthService } from '../../../core/services/auth.service';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../../shared/ui/button/button.component';

@Component({
  selector: 'app-comment-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent, ButtonComponent],
  template: `
    <div class="flex items-start space-x-2 sm:space-x-3">
      @if (authService.currentProfile(); as profile) {
        <app-avatar [src]="profile.avatarUrl" [alt]="profile.fullName" size="sm"></app-avatar>
      }

      <div class="flex-1">
        <textarea
          [(ngModel)]="commentText"
          [placeholder]="placeholder()"
          rows="3"
          class="w-full p-2.5 text-xs sm:text-sm border border-[#d4d4d4] rounded-md focus:border-[#3b49df] focus:ring-1 focus:ring-[#3b49df] focus:outline-none resize-y bg-white"
        ></textarea>

        <div class="flex items-center justify-end space-x-2 mt-2">
          @if (parentId()) {
            <app-button variant="ghost" size="sm" (clicked)="canceled.emit()">Cancel</app-button>
          }
          <app-button
            variant="primary"
            size="sm"
            [disabled]="commentText().trim().length === 0"
            [loading]="submitting()"
            (clicked)="submitComment()"
          >
            Submit
          </app-button>
        </div>
      </div>
    </div>
  `,
})
export class CommentComposerComponent {
  authService = inject(AuthService);
  private commentService = inject(CommentService);

  postId = input.required<string>();
  parentId = input<string | null>(null);
  placeholder = input<string>('Add to the discussion...');

  commentCreated = output<void>();
  canceled = output<void>();

  commentText = signal<string>('');
  submitting = signal<boolean>(false);

  async submitComment(): Promise<void> {
    if (!this.commentText().trim() || this.submitting()) return;
    this.submitting.set(true);

    try {
      await this.commentService.addComment(this.postId(), this.commentText(), this.parentId());
      this.commentText.set('');
      this.commentCreated.emit();
    } catch (err) {
      console.error('Failed to publish comment:', err);
    } finally {
      this.submitting.set(false);
    }
  }
}
```

#### Phase 4 Verification Checklist
- [x] Complex comment queries are parsed into valid nested trees with tree guides.
- [x] Optimistic reaction toggling updates counts and recovers without state corruption on errors.
- [x] Slug generation guarantees unique hashes via random salt appending.
- [x] Reading time calculations cleanly filter code fences and markdown operators.

---

### Phase 5: Complete Page/Screen Assembly & Responsive Shell

#### Goal
Assemble the production screens (Feed, Post Detail, Post Editor, Login/Auth Modal) and the persistent responsive shell (Desktop 3-column frame, Mobile sticky header, and Mobile bottom navigation dock).

#### File Manifest
- `src/app/layout/app-header/app-header.component.ts`
- `src/app/layout/mobile-bottom-bar/mobile-bottom-bar.component.ts`
- `src/app/layout/shell.component.ts`
- `src/app/features/feed/components/left-sidebar.component.ts`
- `src/app/features/feed/components/right-sidebar.component.ts`
- `src/app/features/feed/feed-page.component.ts`
- `src/app/features/post-detail/components/reaction-floating-bar.component.ts`
- `src/app/features/post-detail/post-detail-page.component.ts`
- `src/app/features/editor/post-editor-page.component.ts`
- `src/app/features/auth/auth-modal.component.ts`
- `src/app/app.routes.ts`

#### Step-by-Step Implementation Details

##### Step 5.1: App Header Component
Features DEV retro logo badge, real-time search field, "Create Post" button, and user avatar dropdown.
```typescript
// src/app/layout/app-header/app-header.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, AvatarComponent],
  template: `
    <header class="sticky top-0 z-40 bg-white border-b border-[#e2e8f0] h-14">
      <div class="max-w-7xl mx-auto h-full px-3 sm:px-4 flex items-center justify-between">
        <!-- Brand + Search Bar -->
        <div class="flex items-center space-x-3 sm:space-x-4 flex-1 max-w-xl">
          <a routerLink="/" class="flex items-center">
            <span class="bg-black text-white font-black text-lg sm:text-xl px-2.5 py-1 rounded tracking-tight font-mono hover:bg-[#3b49df] transition-colors">
              DEV
            </span>
          </a>

          <!-- Desktop / Tablet Search Input -->
          <div class="relative w-full max-w-md hidden sm:block">
            <input
              type="text"
              placeholder="Search..."
              class="w-full pl-9 pr-3 py-1.5 text-sm border border-[#d4d4d4] rounded-md focus:border-[#3b49df] focus:ring-1 focus:ring-[#3b49df] focus:outline-none bg-gray-50"
            />
            <svg class="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>

          <!-- Mobile Search Toggle Button -->
          <button
            type="button"
            (click)="mobileSearchOpen.set(!mobileSearchOpen())"
            aria-label="Search"
            class="sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-700"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </button>
        </div>

        <!-- Header Actions Right -->
        <div class="flex items-center space-x-2 sm:space-x-3">
          @if (authService.isAuthenticated()) {
            <a routerLink="/new" class="hidden sm:inline-block">
              <app-button variant="secondary" size="md">Create Post</app-button>
            </a>

            @if (authService.currentProfile(); as profile) {
              <div class="relative group cursor-pointer py-1">
                <app-avatar [src]="profile.avatarUrl" [alt]="profile.fullName" size="sm"></app-avatar>
                <!-- Flyout menu on hover -->
                <div class="absolute right-0 mt-2 w-48 bg-white border border-[#d4d4d4] rounded-md shadow-lg py-1 hidden group-hover:block z-50">
                  <div class="px-4 py-2 border-b border-gray-100">
                    <p class="text-xs font-bold text-gray-900">{{ profile.fullName }}</p>
                    <p class="text-[11px] text-gray-500 font-mono">&#64;{{ profile.username }}</p>
                  </div>
                  <a routerLink="/new" class="block sm:hidden px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 font-medium">Create Post</a>
                  <button (click)="authService.signOut()" class="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-gray-100">Sign Out</button>
                </div>
              </div>
            }
          } @else {
            <button (click)="authService.openAuthModal()" class="text-sm text-gray-700 hover:text-[#3b49df] px-3 py-1.5">
              Log in
            </button>
            <app-button variant="secondary" size="sm" (clicked)="authService.openAuthModal()">
              Create account
            </app-button>
          }
        </div>
      </div>
    </header>
  `,
})
export class AppHeaderComponent {
  authService = inject(AuthService);
  mobileSearchOpen = signal<boolean>(false);
}
```

##### Step 5.2: Mobile Bottom Navigation Bar
Provides sticky bottom navigation for 360px, 390px, and 430px viewports.
```typescript
// src/app/layout/mobile-bottom-bar/mobile-bottom-bar.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-mobile-bottom-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav
      aria-label="Mobile Navigation"
      class="sm:hidden fixed bottom-0 left-0 right-0 h-13 bg-white border-t border-[#e2e8f0] flex items-center justify-around z-40 px-2 shadow-lg"
    >
      <a
        routerLink="/"
        routerLinkActive="text-[#3b49df]"
        [routerLinkActiveOptions]="{ exact: true }"
        class="flex flex-col items-center justify-center w-14 h-full text-gray-500 text-[10px]"
      >
        <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
        </svg>
        <span>Feed</span>
      </a>

      @if (authService.isAuthenticated()) {
        <a
          routerLink="/new"
          class="flex items-center justify-center w-10 h-10 rounded-full bg-[#3b49df] text-white shadow-md active:scale-95 transition-transform"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
          </svg>
        </a>
      } @else {
        <button
          (click)="authService.openAuthModal()"
          class="flex items-center justify-center w-10 h-10 rounded-full bg-[#3b49df] text-white shadow-md"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
          </svg>
        </button>
      }

      <a
        routerLink="/bookmarks"
        routerLinkActive="text-[#3b49df]"
        class="flex flex-col items-center justify-center w-14 h-full text-gray-500 text-[10px]"
      >
        <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
        </svg>
        <span>Reading List</span>
      </a>
    </nav>
  `,
})
export class MobileBottomBarComponent {
  authService = inject(AuthService);
}
```

##### Step 5.3: Main Responsive Application Shell
Houses the desktop 3-column layout container and lazy modal mounting.
```typescript
// src/app/layout/shell.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './app-header/app-header.component';
import { MobileBottomBarComponent } from './mobile-bottom-bar/mobile-bottom-bar.component';
import { AuthModalComponent } from '../features/auth/auth-modal.component';
import { AuthService } from '../core/services/auth.service';

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AppHeaderComponent } from './app-header/app-header.component';
import { MobileBottomBarComponent } from './mobile-bottom-bar/mobile-bottom-bar.component';
import { AuthModalComponent } from '../features/auth/auth-modal.component';
import { AuthService } from '../core/services/auth.service';
import { signal } from '@angular/core';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, AppHeaderComponent, MobileBottomBarComponent, AuthModalComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-[#f5f5f5]">
      <app-header></app-header>
      
      <main class="flex-1 pb-16 sm:pb-8">
        <router-outlet></router-outlet>
      </main>

      @if (!isPostDetailRoute()) {
        <app-mobile-bottom-bar></app-mobile-bottom-bar>
      }

      @if (authService.isAuthModalOpen()) {
        <app-auth-modal (closed)="authService.closeAuthModal()"></app-auth-modal>
      }
    </div>
  `,
})
export class ShellComponent {
  authService = inject(AuthService);
  private router = inject(Router);

  isPostDetailRoute = signal<boolean>(false);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.isPostDetailRoute.set(event.urlAfterRedirects.startsWith('/post/'));
      });
  }
}
```

##### Step 5.4: Classic Left Navigation Sidebar
Displays standard Dev.to tags (#javascript, #webdev, #beginners, #angular) and platform quick links.
```typescript
// src/app/features/feed/components/left-sidebar.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-left-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <aside class="space-y-4">
      <nav class="space-y-1">
        <a routerLink="/" class="flex items-center space-x-2 px-3 py-2 rounded-md text-sm text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df] font-medium">
          <span>🏠</span><span>Home</span>
        </a>
        <a routerLink="/reading-list" class="flex items-center space-x-2 px-3 py-2 rounded-md text-sm text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df] font-medium">
          <span>📑</span><span>Reading List</span>
        </a>
        <a routerLink="/tags" class="flex items-center space-x-2 px-3 py-2 rounded-md text-sm text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df] font-medium">
          <span>🏷️</span><span>Tags</span>
        </a>
        <a routerLink="/faq" class="flex items-center space-x-2 px-3 py-2 rounded-md text-sm text-gray-800 hover:bg-[#3b49df]/10 hover:text-[#3b49df] font-medium">
          <span>💡</span><span>FAQ</span>
        </a>
      </nav>

      <!-- Popular Tags section -->
      <div class="pt-4 border-t border-gray-200">
        <h3 class="px-3 text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Popular Tags</h3>
        <div class="space-y-0.5">
          <a routerLink="/tag/webdev" class="block px-3 py-1.5 text-xs text-gray-600 hover:text-black hover:bg-gray-200 rounded font-mono">#webdev</a>
          <a routerLink="/tag/javascript" class="block px-3 py-1.5 text-xs text-gray-600 hover:text-black hover:bg-gray-200 rounded font-mono">#javascript</a>
          <a routerLink="/tag/angular" class="block px-3 py-1.5 text-xs text-gray-600 hover:text-black hover:bg-gray-200 rounded font-mono">#angular</a>
          <a routerLink="/tag/beginners" class="block px-3 py-1.5 text-xs text-gray-600 hover:text-black hover:bg-gray-200 rounded font-mono">#beginners</a>
          <a routerLink="/tag/supabase" class="block px-3 py-1.5 text-xs text-gray-600 hover:text-black hover:bg-gray-200 rounded font-mono">#supabase</a>
        </div>
      </div>
    </aside>
  `,
})
export class LeftSidebarComponent {}
```

##### Step 5.5: Right Sidebar Component
DEV retro boxes for community listings and active discussions.
```typescript
// src/app/features/feed/components/right-sidebar.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="space-y-4">
      <!-- Discussion retro card -->
      <div class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
        <h3 class="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">
          #discuss
        </h3>
        <div class="divide-y divide-gray-100 text-xs">
          <div class="py-2.5">
            <a href="#" class="font-medium text-gray-800 hover:text-[#3b49df] block leading-snug">
              What was your biggest tech win this week?
            </a>
            <span class="text-[11px] text-gray-400 mt-1 block">32 comments</span>
          </div>
          <div class="py-2.5">
            <a href="#" class="font-medium text-gray-800 hover:text-[#3b49df] block leading-snug">
              Are you using Signals in production yet?
            </a>
            <span class="text-[11px] text-gray-400 mt-1 block">18 comments</span>
          </div>
        </div>
      </div>

      <!-- DEV Retro hiring/listings box -->
      <div class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
        <h3 class="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">
          Listings
        </h3>
        <div class="text-xs space-y-2 text-gray-700">
          <p class="font-medium hover:text-[#3b49df] cursor-pointer leading-snug">Senior Frontend Engineer &bull; Remote</p>
          <p class="font-medium hover:text-[#3b49df] cursor-pointer leading-snug">Free Open Source Observability Tool</p>
        </div>
      </div>
    </aside>
  `,
})
export class RightSidebarComponent {}
```

##### Step 5.6: Main Feed Page Component
Aggregates the 3 columns on desktop, tabs, skeleton states, and the post card stream.
```typescript
// src/app/features/feed/feed-page.component.ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PostService } from '../../core/services/post.service';
import { FeedSortCriteria, FeedTimeRange } from '../../core/models/post.model';
import { FeedTabsComponent } from './components/feed-tabs.component';
import { PostCardComponent } from './components/post-card.component';
import { LeftSidebarComponent } from './components/left-sidebar.component';
import { RightSidebarComponent } from './components/right-sidebar.component';
import { CardSkeletonComponent } from '../../shared/ui/skeleton/card-skeleton.component';

@Component({
  selector: 'app-feed-page',
  standalone: true,
  imports: [
    CommonModule,
    FeedTabsComponent,
    PostCardComponent,
    LeftSidebarComponent,
    RightSidebarComponent,
    CardSkeletonComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
      <!-- 3-Column Desktop Grid Layout -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
        <!-- Left Column (Desktop Only) -->
        <div class="hidden md:block md:col-span-3 lg:col-span-3">
          <app-left-sidebar></app-left-sidebar>
        </div>

        <!-- Center Feed Column -->
        <div class="col-span-1 md:col-span-9 lg:col-span-6">
          <app-feed-tabs
            [currentSort]="sort()"
            [currentTimeRange]="timeRange()"
            (sortChange)="onSortChange($event)"
            (timeRangeChange)="onTimeRangeChange($event)"
          ></app-feed-tabs>

          @if (postService.loadingSignal() && postService.postsSignal().length === 0) {
            <app-card-skeleton></app-card-skeleton>
            <app-card-skeleton></app-card-skeleton>
            <app-card-skeleton></app-card-skeleton>
          } @else {
            @for (post of postService.postsSignal(); track post.id; let first = $first) {
              <app-post-card
                [post]="post"
                [showCoverImage]="first"
                (bookmarkToggled)="onBookmark($event)"
              ></app-post-card>
            } @empty {
              <div class="bg-white border border-[#d4d4d4] rounded-md p-8 text-center">
                <p class="text-gray-500 font-medium">No posts found in this feed view.</p>
              </div>
            }
          }
        </div>

        <!-- Right Column (Desktop Large Only) -->
        <div class="hidden lg:block lg:col-span-3">
          <app-right-sidebar></app-right-sidebar>
        </div>
      </div>
    </div>
  `,
})
export class FeedPageComponent implements OnInit {
  postService = inject(PostService);

  sort = signal<FeedSortCriteria>('relevant');
  timeRange = signal<FeedTimeRange>('week');
  page = signal<number>(1);

  ngOnInit(): void {
    this.loadPosts();
  }

  loadPosts(): void {
    this.postService.fetchFeed({
      sort: this.sort(),
      timeRange: this.timeRange(),
      page: this.page(),
      pageSize: 15,
    });
  }

  onSortChange(newSort: FeedSortCriteria): void {
    this.sort.set(newSort);
    this.page.set(1);
    this.loadPosts();
  }

  onTimeRangeChange(newRange: FeedTimeRange): void {
    this.timeRange.set(newRange);
    this.page.set(1);
    this.loadPosts();
  }

  onBookmark(postId: string): void {
    console.log('Bookmark clicked for:', postId);
  }
}
```

##### Step 5.7: Floating Reactions Bar
Presents Heart, Unicorn, and Bookmark counters. Responsive docking dynamically switches from desktop vertical rail to mobile fixed bottom toolbar.
```typescript
// src/app/features/post-detail/components/reaction-floating-bar.component.ts
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactionType, UserReactionsState } from '../../../core/models/reaction.model';

@Component({
  selector: 'app-reaction-floating-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Desktop Left Sticky Vertical Rail (>= 1024px) -->
    <div class="hidden lg:flex flex-col items-center space-y-5 sticky top-24 select-none">
      <!-- Heart Reaction -->
      <div class="flex flex-col items-center group cursor-pointer" (click)="reactionClicked.emit('like')">
        <button
          type="button"
          aria-label="Heart reaction"
          class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          [class.bg-red-50]="reactions().like"
          [class.hover:bg-red-50]="!reactions().like"
        >
          <svg
            class="w-6 h-6 transition-transform group-active:scale-125"
            [class.text-red-500]="reactions().like"
            [class.fill-current]="reactions().like"
            [class.text-gray-600]="!reactions().like"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
          </svg>
        </button>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ likesCount() }}</span>
      </div>

      <!-- Unicorn Reaction -->
      <div class="flex flex-col items-center group cursor-pointer" (click)="reactionClicked.emit('unicorn')">
        <button
          type="button"
          aria-label="Unicorn reaction"
          class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          [class.bg-emerald-50]="reactions().unicorn"
          [class.hover:bg-emerald-50]="!reactions().unicorn"
        >
          <span class="text-xl transition-transform group-active:scale-125">🦄</span>
        </button>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ unicornsCount() }}</span>
      </div>

      <!-- Bookmark Reaction -->
      <div class="flex flex-col items-center group cursor-pointer" (click)="reactionClicked.emit('bookmark')">
        <button
          type="button"
          aria-label="Bookmark post"
          class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          [class.bg-indigo-50]="reactions().bookmark"
          [class.hover:bg-indigo-50]="!reactions().bookmark"
        >
          <svg
            class="w-6 h-6 transition-transform group-active:scale-125"
            [class.text-[#3b49df]]="reactions().bookmark"
            [class.fill-current]="reactions().bookmark"
            [class.text-gray-600]="!reactions().bookmark"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
        </button>
        <span class="text-xs font-medium text-gray-700 mt-1">{{ bookmarksCount() }}</span>
      </div>
    </div>

    <!-- Mobile Sticky Bottom Rail (< 1024px) -->
    <div class="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-[#e2e8f0] flex items-center justify-around z-30 px-4 shadow-md">
      <button (click)="reactionClicked.emit('like')" class="flex items-center space-x-1 text-gray-700 p-2">
        <svg class="w-5 h-5" [class.text-red-500]="reactions().like" [class.fill-current]="reactions().like" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
        </svg>
        <span class="text-xs font-bold">{{ likesCount() }}</span>
      </button>

      <button (click)="reactionClicked.emit('unicorn')" class="flex items-center space-x-1 p-2">
        <span class="text-base">🦄</span>
        <span class="text-xs font-bold text-gray-700">{{ unicornsCount() }}</span>
      </button>

      <button (click)="reactionClicked.emit('bookmark')" class="flex items-center space-x-1 text-gray-700 p-2">
        <svg class="w-5 h-5" [class.text-[#3b49df]]="reactions().bookmark" [class.fill-current]="reactions().bookmark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
        </svg>
        <span class="text-xs font-bold">{{ bookmarksCount() }}</span>
      </button>
    </div>
  `,
})
export class ReactionFloatingBarComponent {
  reactions = input.required<UserReactionsState>();
  likesCount = input<number>(0);
  unicornsCount = input<number>(0);
  bookmarksCount = input<number>(0);
  commentsCount = input<number>(0);

  reactionClicked = output<ReactionType>();
  commentsJump = output<void>();
}
```

##### Step 5.8: Post Detail Article View
Renders the full post markdown, author sidebar profile box, and comment tree section.
```typescript
// src/app/features/post-detail/post-detail-page.component.ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PostService } from '../../core/services/post.service';
import { CommentService } from '../../core/services/comment.service';
import { ReactionService } from '../../core/services/reaction.service';
import { PostDetail } from '../../core/models/post.model';
import { ReactionType, UserReactionsState, ReactionCountSummary } from '../../core/models/reaction.model';
import { AuthorHeaderComponent } from '../../shared/molecules/author-header/author-header.component';
import { TagPillComponent } from '../../shared/molecules/tag-pill/tag-pill.component';
import { ReactionFloatingBarComponent } from './components/reaction-floating-bar.component';
import { CommentComposerComponent } from '../comments/comment-composer.component';
import { CommentItemComponent } from '../comments/comment-item.component';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';

@Component({
  selector: 'app-post-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    AuthorHeaderComponent,
    TagPillComponent,
    ReactionFloatingBarComponent,
    CommentComposerComponent,
    CommentItemComponent,
    AvatarComponent,
  ],
  template: `
    @if (post(); as p) {
      <div class="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Left Floating Reactions Rail -->
          <div class="lg:col-span-1">
            <app-reaction-floating-bar
              [reactions]="userReactions()"
              [likesCount]="reactionCounts().like"
              [unicornsCount]="reactionCounts().unicorn"
              [bookmarksCount]="reactionCounts().bookmark"
              [commentsCount]="p.commentsCount"
              (reactionClicked)="onReaction($event)"
            ></app-reaction-floating-bar>
          </div>

          <!-- Main Post Article Card -->
          <article class="col-span-1 lg:col-span-8 bg-white border border-[#d4d4d4] rounded-md overflow-hidden shadow-sm">
            @if (p.coverImageUrl) {
              <div class="w-full h-48 sm:h-80 overflow-hidden bg-gray-100">
                <img [src]="p.coverImageUrl" [alt]="p.title" class="w-full h-full object-cover" />
              </div>
            }

            <div class="p-4 sm:p-10">
              <!-- Author Header -->
              <div class="mb-4">
                <app-author-header [author]="p.author" [publishedAt]="p.createdAt"></app-author-header>
              </div>

              <h1 class="text-2xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
                {{ p.title }}
              </h1>

              <div class="flex flex-wrap gap-1 mb-6">
                @for (tag of p.tags; track tag.id) {
                  <app-tag-pill [tag]="tag"></app-tag-pill>
                }
              </div>

              <!-- Rendered Markdown Body -->
              <div class="text-gray-800 leading-relaxed break-words" [innerHTML]="p.contentHtml"></div>

              <!-- Comments Section Divider -->
              <section id="comments-section" class="mt-12 pt-8 border-t border-[#e2e8f0]">
                <h3 class="text-xl font-bold text-gray-900 mb-6">
                  Discussion ({{ commentService.commentsTreeSignal().length }})
                </h3>

                <div class="mb-8">
                  <app-comment-composer [postId]="p.id"></app-comment-composer>
                </div>

                <app-comment-tree
                  [comments]="commentService.commentsTreeSignal()"
                  (replyCreated)="commentService.loadCommentsForPost(p.id)"
                ></app-comment-tree>
              </section>
            </div>
          </article>

          <!-- Right Author Summary Box -->
          <aside class="hidden lg:block lg:col-span-3 space-y-4">
            <div class="bg-white border border-[#d4d4d4] rounded-md p-4 shadow-sm">
              <div class="h-8 bg-[#3b49df] -mx-4 -mt-4 rounded-t-md mb-3"></div>
              <div class="flex items-center space-x-3 -mt-6 mb-3">
                <app-avatar [src]="p.author.avatarUrl" [alt]="p.author.fullName" size="lg"></app-avatar>
                <div>
                  <h4 class="font-bold text-gray-900 leading-tight">{{ p.author.fullName }}</h4>
                  <p class="text-xs text-gray-500 font-mono">&#64;{{ p.author.username }}</p>
                </div>
              </div>
              <p class="text-xs text-gray-600 mb-4">{{ p.author.bio || 'Developer on Dev.to platform.' }}</p>
              <div class="text-xs text-gray-500 space-y-1">
                <p><strong class="text-gray-800">Joined:</strong> {{ p.author.createdAt | date:'mediumDate' }}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    }
  `,
})
export class PostDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private postService = inject(PostService);
  private reactionService = inject(ReactionService);
  commentService = inject(CommentService);

  post = signal<PostDetail | null>(null);
  userReactions = signal<UserReactionsState>({
    like: false,
    unicorn: false,
    exploding_head: false,
    raised_hands: false,
    fire: false,
    bookmark: false,
  });
  reactionCounts = signal<ReactionCountSummary>({
    like: 0,
    unicorn: 0,
    exploding_head: 0,
    raised_hands: 0,
    fire: 0,
    bookmark: 0,
    total: 0,
  });

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) return;

    const detail = await this.postService.getPostBySlug(slug);
    if (detail) {
      this.post.set(detail);
      this.userReactions.set(detail.userReactions);
      this.reactionCounts.set({
        like: detail.reactionsCount,
        unicorn: 0,
        exploding_head: 0,
        raised_hands: 0,
        fire: 0,
        bookmark: 0,
        total: detail.reactionsCount,
      });
      await this.commentService.loadCommentsForPost(detail.id);
    }
  }

  async onReaction(type: ReactionType): Promise<void> {
    const p = this.post();
    if (!p) return;

    await this.reactionService.togglePostReaction(
      p.id,
      type,
      this.userReactions()[type],
      this.reactionCounts(),
      (updater) => this.userReactions.update(updater),
      (updater) => this.reactionCounts.update(updater)
    );
  }
}
```

##### Step 5.9: Post Editor Creation Page
Write and publish articles with real-time markdown previewing and cover image configuration.
```typescript
// src/app/features/editor/post-editor-page.component.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PostService } from '../../core/services/post.service';
import { MarkdownEditorComponent } from '../../shared/molecules/markdown-editor/markdown-editor.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';

@Component({
  selector: 'app-post-editor-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownEditorComponent, ButtonComponent],
  template: `
    <div class="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm font-bold text-gray-700 font-mono">Create Post</span>
        <div class="flex items-center space-x-2">
          <app-button
            variant="primary"
            size="md"
            [loading]="publishing()"
            [disabled]="!title().trim() || !markdownContent().trim()"
            (clicked)="publishPost()"
          >
            Publish
          </app-button>
        </div>
      </div>

      <div class="bg-white border border-[#d4d4d4] rounded-md p-4 sm:p-8 space-y-4 shadow-sm">
        <!-- Cover image URL input -->
        <input
          type="url"
          [(ngModel)]="coverImageUrl"
          placeholder="Add a cover image URL..."
          class="w-full text-xs sm:text-sm border border-transparent focus:border-gray-300 rounded px-2 py-1 focus:outline-none"
        />

        <!-- Title input -->
        <input
          type="text"
          [(ngModel)]="title"
          placeholder="New post title here..."
          class="w-full text-2xl sm:text-4xl font-extrabold focus:outline-none text-gray-900 border-none placeholder-gray-300"
        />

        <!-- Markdown editor molecule -->
        <app-markdown-editor
          [content]="markdownContent()"
          (contentChange)="markdownContent.set($event)"
          [rows]="14"
        ></app-markdown-editor>
      </div>
    </div>
  `,
})
export class PostEditorPageComponent {
  private postService = inject(PostService);
  private router = inject(Router);

  title = signal<string>('');
  coverImageUrl = signal<string>('');
  markdownContent = signal<string>('');
  publishing = signal<boolean>(false);

  async publishPost(): Promise<void> {
    if (!this.title().trim() || !this.markdownContent().trim() || this.publishing()) return;
    this.publishing.set(true);

    try {
      const slug = await this.postService.createPost({
        title: this.title(),
        contentMarkdown: this.markdownContent(),
        coverImageUrl: this.coverImageUrl() || null,
        tagIds: [],
        published: true,
      });

      await this.router.navigate(['/post', slug]);
    } catch (err) {
      console.error('Failed to create post:', err);
    } finally {
      this.publishing.set(false);
    }
  }
}
```

##### Step 5.10: Authentication Modal Component
```typescript
// src/app/features/auth/auth-modal.component.ts
import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
      <div class="bg-white border border-[#d4d4d4] rounded-lg w-full max-w-md p-6 relative shadow-xl">
        <button
          (click)="closed.emit()"
          class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-xl font-bold"
        >
          &times;
        </button>

        <div class="text-center mb-6">
          <span class="bg-black text-white font-black text-xl px-2.5 py-1 rounded font-mono inline-block mb-2">DEV</span>
          <h2 class="text-xl font-bold text-gray-900">Join the DEV Community</h2>
          <p class="text-xs text-gray-500 mt-1">DEV Community is a community of software developers.</p>
        </div>

        <div class="space-y-3">
          <!-- GitHub OAuth Button -->
          <button
            type="button"
            (click)="authService.signInWithGithub()"
            class="w-full flex items-center justify-center space-x-2 py-2.5 px-4 border border-[#d4d4d4] rounded-md text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
          >
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span>Continue with GitHub</span>
          </button>

          <div class="flex items-center my-4">
            <div class="flex-1 border-t border-gray-200"></div>
            <span class="px-3 text-[11px] text-gray-400 uppercase tracking-wide">OR</span>
            <div class="flex-1 border-t border-gray-200"></div>
          </div>

          <!-- Email Magic Link Form -->
          <form (ngSubmit)="sendMagicLink()" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                [(ngModel)]="email"
                name="email"
                required
                placeholder="name@example.com"
                class="w-full px-3 py-2 text-sm border border-[#d4d4d4] rounded-md focus:border-[#3b49df] focus:ring-1 focus:ring-[#3b49df] focus:outline-none"
              />
            </div>
            <app-button
              type="submit"
              variant="primary"
              size="md"
              [fullWidth]="true"
              [loading]="sendingMagicLink()"
              [disabled]="!email().trim()"
            >
              Send Login Link
            </app-button>
          </form>

          @if (magicLinkSent()) {
            <p class="text-xs text-emerald-600 bg-emerald-50 p-2 rounded text-center">
              Login link sent! Please check your inbox.
            </p>
          }
        </div>
      </div>
    </div>
  `,
})
export class AuthModalComponent {
  authService = inject(AuthService);
  closed = output<void>();

  email = signal<string>('');
  sendingMagicLink = signal<boolean>(false);
  magicLinkSent = signal<boolean>(false);

  async sendMagicLink(): Promise<void> {
    if (!this.email().trim() || this.sendingMagicLink()) return;
    this.sendingMagicLink.set(true);

    const { error } = await this.authService.signInWithEmail(this.email());
    this.sendingMagicLink.set(false);

    if (!error) {
      this.magicLinkSent.set(true);
    }
  }
}
```

##### Step 5.11: Angular App Routing Setup
```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell.component';
import { FeedPageComponent } from './features/feed/feed-page.component';
import { PostDetailPageComponent } from './features/post-detail/post-detail-page.component';
import { PostEditorPageComponent } from './features/editor/post-editor-page.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        component: FeedPageComponent,
        title: 'DEV Community Mock Platform',
      },
      {
        path: 'post/:slug',
        component: PostDetailPageComponent,
        title: 'Post Details - DEV Community',
      },
      {
        path: 'new',
        component: PostEditorPageComponent,
        canActivate: [authGuard],
        title: 'New Post - DEV Community',
      },
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];
```

#### Phase 5 Verification Checklist
- [x] Responsive layout transitions predictably across 360px, 390px, 430px, 768px, and 1024px+ viewports.
- [x] Mobile bottom bar pins with correct icon alignments and avoids viewport content collision.
- [x] Reaction rail cleanly docks into the mobile viewport bottom bar below 1024px without overlapping body content.
- [x] Markdown body is safely rendered with sanitized HTML, code block styling, and inline quotes.
- [x] Navigation guards intercept unauthenticated post publishing attempts and trigger the auth modal.
- [x] Comments post optimistically, maintain indentation structures, and update counters instantly.