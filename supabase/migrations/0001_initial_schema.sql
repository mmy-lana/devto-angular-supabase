-- Dev.to mock platform — initial schema (plan.md §1.1).
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- before starting the app: it creates the tables, indexes, row level security
-- policies and the triggers that keep the denormalised counters in sync.
--
-- The application expects every object below to exist. `handle_new_user`
-- mirrors each new auth user into `public.profiles`, which is why the app never
-- inserts profile rows itself.

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
create policy "Users can update their own profile" on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- Tags: Read-only for public; authenticated users can insert missing tags
create policy "Tags are viewable by everyone" on public.tags for select using (true);
create policy "Authenticated users can create tags" on public.tags for insert with check (auth.role() = 'authenticated');

-- Posts: Public read if published; author can read/write unpublished.
-- SEC-02: `with check` is required in addition to `using`. Without it an author
-- could reassign `author_id` to somebody else on update, which both forges
-- authorship and hands the row to another account.
create policy "Public posts are viewable by everyone" on public.posts for select using (published = true or auth.uid() = author_id);
create policy "Authenticated users can insert posts" on public.posts for insert with check (auth.uid() = author_id);
create policy "Authors can update their own posts" on public.posts for update
    using (auth.uid() = author_id)
    with check (auth.uid() = author_id);
create policy "Authors can delete their own posts" on public.posts for delete using (auth.uid() = author_id);

-- Post Tags: Viewable by everyone; managed by post author
create policy "Post tags viewable by everyone" on public.post_tags for select using (true);
create policy "Post authors can insert post tags" on public.post_tags for insert with check (
    exists (select 1 from public.posts where id = post_id and author_id = auth.uid())
);
create policy "Post authors can delete post tags" on public.post_tags for delete using (
    exists (select 1 from public.posts where id = post_id and author_id = auth.uid())
);

-- Comments: Public view; authenticated creation; owner update/delete.
-- SEC-02: `with check` pins `author_id` (and therefore the post the comment
-- belongs to) for the whole lifetime of the row.
create policy "Comments are viewable by everyone" on public.comments for select using (true);
create policy "Authenticated users can create comments" on public.comments for insert with check (auth.uid() = author_id);
create policy "Authors can update their own comments" on public.comments for update
    using (auth.uid() = author_id)
    with check (auth.uid() = author_id);
create policy "Authors can delete their own comments" on public.comments for delete using (auth.uid() = author_id);

-- Reactions: Public view; authenticated toggle (insert/delete)
create policy "Reactions are viewable by everyone" on public.reactions for select using (true);
create policy "Authenticated users can insert reactions" on public.reactions for insert with check (auth.uid() = user_id);
create policy "Users can delete their own reactions" on public.reactions for delete using (auth.uid() = user_id);

-- 9. TRIGGERS & RPC COUNTER SYNCHRONIZERS

-- Auto-create the profile row for a new auth user, with a username that always
-- satisfies the `profiles.username` check constraint.
--
-- SEC-01: `raw_user_meta_data` is user controlled — it is copied verbatim from
-- whatever the sign-up client sent. Previously it was inserted unvalidated, so a
-- name such as `O'Brien`, `#1 dev` or an empty string aborted the trigger, the
-- transaction, and therefore the whole sign-up. The value is now reduced to
-- `[a-zA-Z0-9_]`, and anything shorter than three characters (including the
-- empty result of a fully invalid name) falls back to a deterministic id-derived
-- handle. The collision loop still guarantees uniqueness for both paths.
create or replace function public.handle_new_user()
returns trigger as $$
declare
    raw_username text;
    base_username text;
    final_username text;
    counter integer := 0;
begin
    raw_username := regexp_replace(
        coalesce(new.raw_user_meta_data->>'user_name', ''),
        '[^a-zA-Z0-9_]',
        '',
        'g'
    );

    if char_length(raw_username) < 3 then
        base_username := 'dev_' || substr(md5(new.id::text), 1, 8);
    else
        base_username := left(raw_username, 30);
    end if;

    final_username := base_username;

    while exists (select 1 from public.profiles where username = final_username) loop
        counter := counter + 1;
        final_username := base_username || counter::text;
    end loop;

    insert into public.profiles (id, username, full_name, avatar_url)
    values (
        new.id,
        final_username,
        coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Dev Member'),
        coalesce(
            nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
            'https://api.dicebear.com/7.x/bottts/svg?seed=' || new.id::text
        )
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

-- Atomic comment likes counter trigger.
--
-- DATA-01: `public.comments.likes_count` had no writer at all, so every comment
-- rendered the stale default 0 forever — the optimistic like in the UI snapped
-- back to zero on the next reload. The counter now tracks `like` reactions that
-- carry a `comment_id`; reactions are immutable (the app only inserts and
-- deletes them, and there is no update policy on the table), so insert/delete is
-- the complete mutation surface. Rows written before this trigger existed are
-- repaired by the backfill at the end of this file.
create or replace function public.update_comment_likes_count()
returns trigger as $$
begin
    if (TG_OP = 'INSERT' and NEW.comment_id is not null and NEW.reaction = 'like') then
        update public.comments
        set likes_count = likes_count + 1
        where id = NEW.comment_id;
    elsif (TG_OP = 'DELETE' and OLD.comment_id is not null and OLD.reaction = 'like') then
        update public.comments
        set likes_count = greatest(likes_count - 1, 0)
        where id = OLD.comment_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger trg_comment_like_count
    after insert or delete on public.reactions
    for each row execute function public.update_comment_likes_count();

-- One-time reconciliation for databases that already held like reactions before
-- `trg_comment_like_count` existed. Idempotent: it recomputes the column from
-- the source of truth instead of incrementing it.
update public.comments c
set likes_count = coalesce(r.likes, 0)
from (
    select comment_id, count(*)::integer as likes
    from public.reactions
    where comment_id is not null and reaction = 'like'
    group by comment_id
) r
where r.comment_id = c.id and c.likes_count <> coalesce(r.likes, 0);

update public.comments c
set likes_count = 0
where c.likes_count <> 0
  and not exists (
      select 1 from public.reactions r
      where r.comment_id = c.id and r.reaction = 'like'
  );
