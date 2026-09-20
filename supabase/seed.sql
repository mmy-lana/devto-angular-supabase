-- Dev.to mock platform — docker seed data.
--
-- GENERATED FILE: do not edit the content below by hand.
-- Source of truth: src/app/core/mocks/devto-mock-data.ts
-- Regenerate with: pnpm seed:generate
--
-- The dataset is also the offline fallback dataset. Both describe the same
-- 3 authors, 5 tags, 5 posts, 11 comments and their reactions, so a
-- reader who loses the connection keeps reading the discussion they had open.
--
-- Denormalised counters are deliberately left to the triggers installed by
-- 0001_initial_schema.sql. posts.reactions_count, posts.comments_count and
-- comments.likes_count are written by the reaction and comment triggers as the
-- rows below are inserted; seeding them by hand would be the first place the
-- sample data drifts from the schema that maintains it.
--
-- Re-runnable: the sample rows are replaced, not appended to.

begin;

-- 0. Replace any previous copy of the sample dataset.
-- The sample accounts are removed first: public.profiles references
-- auth.users, so the trigger cannot recreate the profile rows while the old
-- identities are still present. Deleting them cascades to the sample profiles
-- and their content, after which the content tables are emptied wholesale so a
-- re-run never appends a second copy of the dataset. Profiles belonging to
-- accounts created through the running application are left alone.
delete from auth.users where id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
);

delete from public.profiles where id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
);

truncate table
    public.reactions,
    public.comments,
    public.post_tags,
    public.posts,
    public.tags
cascade;

-- 1. Accounts. Real profiles are always created by the on_auth_user_created
--    trigger, never by the application, so the seed registers the identities and
--    lets the trigger mirror them.
-- Identities own the profile rows: public.profiles.id references auth.users,
-- so the accounts have to exist first and public.handle_new_user() creates the
-- profile while inserting them. The update that follows fills in the fields the
-- trigger does not know about.
insert into auth.users
    (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
    ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex_dev@devto.example', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"user_name":"alex_dev","full_name":"Alex Rivera","avatar_url":"https://api.dicebear.com/7.x/bottts/svg?seed=alex_dev"}'::jsonb, now(), now()),
    ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah_codes@devto.example', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"user_name":"sarah_codes","full_name":"Sarah Chen","avatar_url":"https://api.dicebear.com/7.x/bottts/svg?seed=sarah_codes"}'::jsonb, now(), now()),
    ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcus_tech@devto.example', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"user_name":"marcus_tech","full_name":"Marcus Bell","avatar_url":"https://api.dicebear.com/7.x/bottts/svg?seed=marcus_tech"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- 2. Profile details the trigger does not know about.
update public.profiles as profile
set
    username = seed.username,
    full_name = seed.full_name,
    avatar_url = seed.avatar_url,
    bio = seed.bio,
    website_url = seed.website_url,
    github_username = seed.github_username,
    twitter_username = seed.twitter_username,
    created_at = seed.created_at,
    updated_at = seed.updated_at
from (
    values
        ('11111111-1111-4111-8111-111111111111'::uuid, 'alex_dev', 'Alex Rivera', 'https://api.dicebear.com/7.x/bottts/svg?seed=alex_dev', 'Fullstack engineer. Postgres, TypeScript and the parts of the browser nobody reads about.', 'https://alexrivera.dev', 'alexrivera', 'alexrivera_dev', '2021-03-14T09:12:00.000Z'::timestamptz, '2024-11-02T18:40:00.000Z'::timestamptz),
        ('22222222-2222-4222-8222-222222222222'::uuid, 'sarah_codes', 'Sarah Chen', 'https://api.dicebear.com/7.x/bottts/svg?seed=sarah_codes', 'Database reliability engineer. Row level security, migrations and the tests that catch them.', 'https://sarahchen.dev', 'sarahcodes', 'sarah_codes', '2020-08-01T07:05:00.000Z'::timestamptz, '2024-10-21T12:15:00.000Z'::timestamptz),
        ('33333333-3333-4333-8333-333333333333'::uuid, 'marcus_tech', 'Marcus Bell', 'https://api.dicebear.com/7.x/bottts/svg?seed=marcus_tech', 'Frontend infrastructure. Compilers, design systems and build tooling.', 'https://marcusbell.io', 'marcusbell', 'marcus_tech', '2019-05-30T15:45:00.000Z'::timestamptz, '2024-09-18T08:30:00.000Z'::timestamptz)
) as seed (id, username, full_name, avatar_url, bio, website_url, github_username, twitter_username, created_at, updated_at)
where profile.id = seed.id;

-- 3. Tags, ordered by name to match the catalogue query.
insert into public.tags
    (id, name, display_name, hex_color, bg_color, description, created_at)
values
    ('10000000-0000-4000-8000-000000000002', 'angular', 'Angular', '#dd0031', '#fde8eb', 'Components, signals, routing and the Angular build pipeline.', '2024-01-05T10:00:00.000Z'),
    ('10000000-0000-4000-8000-000000000005', 'css', 'CSS', '#264de4', '#e9eefc', 'Layout, typography and modern responsive techniques.', '2024-01-05T10:00:00.000Z'),
    ('10000000-0000-4000-8000-000000000004', 'supabase', 'Supabase', '#1f9d6b', '#e6f7f0', 'Postgres, row level security, realtime and the Supabase platform.', '2024-01-05T10:00:00.000Z'),
    ('10000000-0000-4000-8000-000000000003', 'typescript', 'TypeScript', '#3178c6', '#eaf2fa', 'Types, generics, decorators and type-safe application design.', '2024-01-05T10:00:00.000Z'),
    ('10000000-0000-4000-8000-000000000001', 'webdev', 'WebDev', '#3b49df', '#ebedf8', 'Building for the web: browsers, HTTP, performance and everything in between.', '2024-01-05T10:00:00.000Z');

-- 4. Posts. content_html and reading_time_minutes are produced from
--    content_markdown by the same renderer the application uses.
insert into public.posts
    (id, author_id, title, slug, content_markdown, content_html, cover_image_url, reading_time_minutes, published, created_at, updated_at)
values
    ('20000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Building a Realtime Feed with Angular Signals and Supabase', 'building-a-realtime-feed-with-angular-signals-and-supabase', $md_1$Supabase streams Postgres changes over a websocket, and Angular ships a reactivity primitive that fits that shape well. Together they make a live feed small enough to reason about on one screen of code.

This post walks through the shape I use in production: a signal that owns the page of posts, a channel that patches it in place, and a reconnect path that never duplicates a card.

## Why a refresh loop fails

Polling every few seconds is the easiest thing to reach for, and the most expensive:

- Every client re-reads rows it already has.
- The request rate scales with the number of open tabs, not with the number of new posts.
- A slow response can land after a newer one and move the list backwards.

Realtime changes invert that: the server pushes one row and the client decides what it means.

## Model the page as a signal

The feed is a signal of summaries plus a cursor. Nothing else is stateful:

```ts
readonly posts = signal<PostSummary[]>([]);
private cursor: FeedCursor | null = null;

async loadNextPage(filter: FeedFilter): Promise<void> {
  const page = await this.fetchPage(filter, this.cursor);

  this.posts.update((current) => dedupeById([...current, ...page.rows]));
  this.cursor = page.cursor;
}
```

`dedupeById` is the important part. A realtime insert that arrives while a page is in flight is delivered twice: once by the channel, once by the query that already included it. Keying by id makes that idempotent.

## Subscribe server-side

Enable replication for the tables you need, then filter in the subscription:

```sql
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.comments;
```

| Event | What the client does |
| --- | --- |
| INSERT on posts | Prepend when it matches the active filter |
| UPDATE on posts | Replace the summary in place |
| DELETE on posts | Remove the card |
| INSERT on comments | Bump the discussion counter |

## Three details that bite

1. Row level security still applies to the stream. A subscriber only receives rows it could have selected, so an unpublished draft never leaks into another reader's feed.
2. Counters maintained by triggers arrive inside the payload. Trusting them keeps arithmetic out of the client.
3. A reconnect does not replay the events missed while offline. Refetch the first page on the SUBSCRIBED callback.

> A realtime feed is a cache invalidation problem wearing a websocket costume.

The [Supabase Realtime guide](https://supabase.com/docs/guides/realtime) covers the channel API, and the [PostgREST reference](https://postgrest.org/en/stable/references/api/tables_views.html) documents the filters the cursor relies on.$md_1$, $html_1$<p>Supabase streams Postgres changes over a websocket, and Angular ships a reactivity primitive that fits that shape well. Together they make a live feed small enough to reason about on one screen of code.</p>
<p>This post walks through the shape I use in production: a signal that owns the page of posts, a channel that patches it in place, and a reconnect path that never duplicates a card.</p>
<h2>Why a refresh loop fails</h2>
<p>Polling every few seconds is the easiest thing to reach for, and the most expensive:</p>
<ul>
<li>Every client re-reads rows it already has.</li>
<li>The request rate scales with the number of open tabs, not with the number of new posts.</li>
<li>A slow response can land after a newer one and move the list backwards.</li>
</ul>
<p>Realtime changes invert that: the server pushes one row and the client decides what it means.</p>
<h2>Model the page as a signal</h2>
<p>The feed is a signal of summaries plus a cursor. Nothing else is stateful:</p>
<pre><code class="language-ts">readonly posts = signal&lt;PostSummary[]&gt;([]);
private cursor: FeedCursor | null = null;

async loadNextPage(filter: FeedFilter): Promise&lt;void&gt; {
  const page = await this.fetchPage(filter, this.cursor);

  this.posts.update((current) =&gt; dedupeById([...current, ...page.rows]));
  this.cursor = page.cursor;
}
</code></pre>
<p><code>dedupeById</code> is the important part. A realtime insert that arrives while a page is in flight is delivered twice: once by the channel, once by the query that already included it. Keying by id makes that idempotent.</p>
<h2>Subscribe server-side</h2>
<p>Enable replication for the tables you need, then filter in the subscription:</p>
<pre><code class="language-sql">alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.comments;
</code></pre>
<table>
<thead>
<tr>
<th>Event</th>
<th>What the client does</th>
</tr>
</thead>
<tbody><tr>
<td>INSERT on posts</td>
<td>Prepend when it matches the active filter</td>
</tr>
<tr>
<td>UPDATE on posts</td>
<td>Replace the summary in place</td>
</tr>
<tr>
<td>DELETE on posts</td>
<td>Remove the card</td>
</tr>
<tr>
<td>INSERT on comments</td>
<td>Bump the discussion counter</td>
</tr>
</tbody></table>
<h2>Three details that bite</h2>
<ol>
<li>Row level security still applies to the stream. A subscriber only receives rows it could have selected, so an unpublished draft never leaks into another reader&#39;s feed.</li>
<li>Counters maintained by triggers arrive inside the payload. Trusting them keeps arithmetic out of the client.</li>
<li>A reconnect does not replay the events missed while offline. Refetch the first page on the SUBSCRIBED callback.</li>
</ol>
<blockquote>
<p>A realtime feed is a cache invalidation problem wearing a websocket costume.</p>
</blockquote>
<p>The <a target="_blank" rel="noopener noreferrer" href="https://supabase.com/docs/guides/realtime">Supabase Realtime guide</a> covers the channel API, and the <a target="_blank" rel="noopener noreferrer" href="https://postgrest.org/en/stable/references/api/tables_views.html">PostgREST reference</a> documents the filters the cursor relies on.</p>
$html_1$, 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80', 2, true, now() - interval '5 hours', now() - interval '4 hours'),
    ('20000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Row Level Security Patterns for Supabase Apps', 'row-level-security-patterns-for-supabase-apps', $md_2$Row level security is the only thing standing between your anon key and your data. It is also the part of a Supabase project that is easiest to get subtly wrong, because a missing policy fails open at the table level and closed at the row level in ways that are hard to spot in review.

## The default is not safe

A table without RLS enabled is readable by anyone holding the anon key. Enabling RLS with no policy makes it readable by nobody. Neither state is a decision somebody made, so write it down:

```sql
alter table public.posts enable row level security;

create policy "Public posts are viewable by everyone"
  on public.posts for select
  using (published = true or auth.uid() = author_id);
```

## USING answers which rows, WITH CHECK answers which writes

`USING` filters the rows a statement can see. `WITH CHECK` validates the row a statement wants to store. On an update, `USING` is evaluated against the row as it exists and `WITH CHECK` against the row as it would exist afterwards.

Postgres reuses `USING` as the check when no `WITH CHECK` is given, which is why an omitted clause survives review: the obvious attack still fails. The cost is that the guarantee is implicit, and the moment somebody extends `USING` the write path changes with it.

| Statement | USING | WITH CHECK |
| --- | --- | --- |
| SELECT | yes | not evaluated |
| INSERT | no | yes |
| UPDATE | yes | yes |
| DELETE | yes | no |

## Ownership on join tables

A join row has no owner column, so the predicate has to travel through its parent:

```sql
create policy "Post authors can insert post tags"
  on public.post_tags for insert
  with check (
    exists (
      select 1 from public.posts
      where id = post_id and author_id = auth.uid()
    )
  );
```

Three habits keep this honest:

- Write the negative test first: can user B edit user A's row?
- Keep one policy per verb rather than a single `for all` policy.
- Re-check ownership on update, not only on select.

Treat metadata as input too. The trigger that mirrors `auth.users` into `public.profiles` reads user controlled JSON, and a value that violates a check constraint aborts the surrounding transaction — including the sign-up that triggered it.$md_2$, $html_2$<p>Row level security is the only thing standing between your anon key and your data. It is also the part of a Supabase project that is easiest to get subtly wrong, because a missing policy fails open at the table level and closed at the row level in ways that are hard to spot in review.</p>
<h2>The default is not safe</h2>
<p>A table without RLS enabled is readable by anyone holding the anon key. Enabling RLS with no policy makes it readable by nobody. Neither state is a decision somebody made, so write it down:</p>
<pre><code class="language-sql">alter table public.posts enable row level security;

create policy &quot;Public posts are viewable by everyone&quot;
  on public.posts for select
  using (published = true or auth.uid() = author_id);
</code></pre>
<h2>USING answers which rows, WITH CHECK answers which writes</h2>
<p><code>USING</code> filters the rows a statement can see. <code>WITH CHECK</code> validates the row a statement wants to store. On an update, <code>USING</code> is evaluated against the row as it exists and <code>WITH CHECK</code> against the row as it would exist afterwards.</p>
<p>Postgres reuses <code>USING</code> as the check when no <code>WITH CHECK</code> is given, which is why an omitted clause survives review: the obvious attack still fails. The cost is that the guarantee is implicit, and the moment somebody extends <code>USING</code> the write path changes with it.</p>
<table>
<thead>
<tr>
<th>Statement</th>
<th>USING</th>
<th>WITH CHECK</th>
</tr>
</thead>
<tbody><tr>
<td>SELECT</td>
<td>yes</td>
<td>not evaluated</td>
</tr>
<tr>
<td>INSERT</td>
<td>no</td>
<td>yes</td>
</tr>
<tr>
<td>UPDATE</td>
<td>yes</td>
<td>yes</td>
</tr>
<tr>
<td>DELETE</td>
<td>yes</td>
<td>no</td>
</tr>
</tbody></table>
<h2>Ownership on join tables</h2>
<p>A join row has no owner column, so the predicate has to travel through its parent:</p>
<pre><code class="language-sql">create policy &quot;Post authors can insert post tags&quot;
  on public.post_tags for insert
  with check (
    exists (
      select 1 from public.posts
      where id = post_id and author_id = auth.uid()
    )
  );
</code></pre>
<p>Three habits keep this honest:</p>
<ul>
<li>Write the negative test first: can user B edit user A&#39;s row?</li>
<li>Keep one policy per verb rather than a single <code>for all</code> policy.</li>
<li>Re-check ownership on update, not only on select.</li>
</ul>
<p>Treat metadata as input too. The trigger that mirrors <code>auth.users</code> into <code>public.profiles</code> reads user controlled JSON, and a value that violates a check constraint aborts the surrounding transaction — including the sign-up that triggered it.</p>
$html_2$, 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80', 2, true, now() - interval '11 hours', now() - interval '10 hours'),
    ('20000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'TypeScript Decorators: What Changed and Why It Matters', 'typescript-decorators-what-changed-and-why-it-matters', $md_3$The decorator proposal TypeScript implemented in 2015 was never standardised in that form. The proposal that did reach stage 3 is what the compiler emits when `experimentalDecorators` is off, and the two are not compatible with each other.

## What actually changed

The legacy implementation called a function with the class, the property key and a property descriptor, and let it replace the target. The standard implementation calls a function with a value and a context object, and lets it return a replacement for that value:

```ts
function logged<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
) {
  const name = String(context.name);

  return function (this: This, ...args: Args): Return {
    const started = performance.now();
    const result = target.apply(this, args);

    console.log(name, performance.now() - started);

    return result;
  };
}
```

## Why it matters even if you write none

Angular, Nest and TypeORM all build on decorators. When the underlying semantics change, the framework contract changes with them.

| Aspect | Legacy | Standard |
| --- | --- | --- |
| Class access | available at decoration time | not provided |
| Return value | may replace the descriptor | may replace the decorated value |
| Metadata | reflect-metadata | context.metadata |
| Initialisers | run after decoration | run before the replacement applies |

## Migration check-list

1. Turn off `experimentalDecorators` and `emitDecoratorMetadata` and compile.
2. Replace descriptor mutation with a returned replacement.
3. Move injected metadata to `context.metadata`.
4. Re-run the suite: failures cluster around property initialisation order.

> Decorators are not magic. They are a function call with a compile-time guarantee about the shape of its arguments.

Read the [TC39 proposal](https://github.com/tc39/proposal-decorators) next to the [TypeScript 5 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/).$md_3$, $html_3$<p>The decorator proposal TypeScript implemented in 2015 was never standardised in that form. The proposal that did reach stage 3 is what the compiler emits when <code>experimentalDecorators</code> is off, and the two are not compatible with each other.</p>
<h2>What actually changed</h2>
<p>The legacy implementation called a function with the class, the property key and a property descriptor, and let it replace the target. The standard implementation calls a function with a value and a context object, and lets it return a replacement for that value:</p>
<pre><code class="language-ts">function logged&lt;This, Args extends unknown[], Return&gt;(
  target: (this: This, ...args: Args) =&gt; Return,
  context: ClassMethodDecoratorContext&lt;This, (this: This, ...args: Args) =&gt; Return&gt;,
) {
  const name = String(context.name);

  return function (this: This, ...args: Args): Return {
    const started = performance.now();
    const result = target.apply(this, args);

    console.log(name, performance.now() - started);

    return result;
  };
}
</code></pre>
<h2>Why it matters even if you write none</h2>
<p>Angular, Nest and TypeORM all build on decorators. When the underlying semantics change, the framework contract changes with them.</p>
<table>
<thead>
<tr>
<th>Aspect</th>
<th>Legacy</th>
<th>Standard</th>
</tr>
</thead>
<tbody><tr>
<td>Class access</td>
<td>available at decoration time</td>
<td>not provided</td>
</tr>
<tr>
<td>Return value</td>
<td>may replace the descriptor</td>
<td>may replace the decorated value</td>
</tr>
<tr>
<td>Metadata</td>
<td>reflect-metadata</td>
<td>context.metadata</td>
</tr>
<tr>
<td>Initialisers</td>
<td>run after decoration</td>
<td>run before the replacement applies</td>
</tr>
</tbody></table>
<h2>Migration check-list</h2>
<ol>
<li>Turn off <code>experimentalDecorators</code> and <code>emitDecoratorMetadata</code> and compile.</li>
<li>Replace descriptor mutation with a returned replacement.</li>
<li>Move injected metadata to <code>context.metadata</code>.</li>
<li>Re-run the suite: failures cluster around property initialisation order.</li>
</ol>
<blockquote>
<p>Decorators are not magic. They are a function call with a compile-time guarantee about the shape of its arguments.</p>
</blockquote>
<p>Read the <a target="_blank" rel="noopener noreferrer" href="https://github.com/tc39/proposal-decorators">TC39 proposal</a> next to the <a target="_blank" rel="noopener noreferrer" href="https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/">TypeScript 5 release notes</a>.</p>
$html_3$, 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80', 2, true, now() - interval '27 hours', now() - interval '26 hours'),
    ('20000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Modern CSS Layout Without Media Query Spaghetti', 'modern-css-layout-without-media-query-spaghetti', $md_4$Most media-query spaghetti is a symptom rather than a cause: the layout was written for one viewport and then patched for every other one. Intrinsic layout asks the browser to solve the same problem from constraints instead of breakpoints.

## Start from the constraints you already have

Every element has a natural width, a minimum content width and whatever space its parent offers. Modern CSS exposes all three:

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}
```

`auto-fit` with `minmax()` gives a responsive grid with no breakpoints at all. The inner `min(100%, 18rem)` is what stops a track from overflowing a 320px container that is narrower than the track itself.

## Fluid type with a floor

`clamp()` is the same idea applied to typography:

```css
:root {
  --step-2: clamp(1.5rem, 1.2rem + 1.2vw, 2rem);
}

.post-title {
  font-size: var(--step-2);
  overflow-wrap: anywhere;
}
```

| Technique | Replaces | Watch out for |
| --- | --- | --- |
| auto-fit grid | column-count breakpoints | empty tracks when there are few items |
| clamp() | font-size breakpoints | a floor that is too small to read |
| flex-wrap | float hacks | tall ragged rows |
| overflow-x: auto | a horizontally scrolling page | keyboard traps inside the scroller |

## Wide content should scroll inside itself

Tables, long code lines and embedded diagrams must never widen the page:

```css
.prose table {
  display: block;
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

Two habits worth keeping:

1. Test at 360px before 1440px; the narrow case fails first.
2. Prefer `min()`, `max()` and `clamp()` over a breakpoint you have to keep in sync with a class name.

> The best breakpoint is the one you did not have to write.$md_4$, $html_4$<p>Most media-query spaghetti is a symptom rather than a cause: the layout was written for one viewport and then patched for every other one. Intrinsic layout asks the browser to solve the same problem from constraints instead of breakpoints.</p>
<h2>Start from the constraints you already have</h2>
<p>Every element has a natural width, a minimum content width and whatever space its parent offers. Modern CSS exposes all three:</p>
<pre><code class="language-css">.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}
</code></pre>
<p><code>auto-fit</code> with <code>minmax()</code> gives a responsive grid with no breakpoints at all. The inner <code>min(100%, 18rem)</code> is what stops a track from overflowing a 320px container that is narrower than the track itself.</p>
<h2>Fluid type with a floor</h2>
<p><code>clamp()</code> is the same idea applied to typography:</p>
<pre><code class="language-css">:root {
  --step-2: clamp(1.5rem, 1.2rem + 1.2vw, 2rem);
}

.post-title {
  font-size: var(--step-2);
  overflow-wrap: anywhere;
}
</code></pre>
<table>
<thead>
<tr>
<th>Technique</th>
<th>Replaces</th>
<th>Watch out for</th>
</tr>
</thead>
<tbody><tr>
<td>auto-fit grid</td>
<td>column-count breakpoints</td>
<td>empty tracks when there are few items</td>
</tr>
<tr>
<td>clamp()</td>
<td>font-size breakpoints</td>
<td>a floor that is too small to read</td>
</tr>
<tr>
<td>flex-wrap</td>
<td>float hacks</td>
<td>tall ragged rows</td>
</tr>
<tr>
<td>overflow-x: auto</td>
<td>a horizontally scrolling page</td>
<td>keyboard traps inside the scroller</td>
</tr>
</tbody></table>
<h2>Wide content should scroll inside itself</h2>
<p>Tables, long code lines and embedded diagrams must never widen the page:</p>
<pre><code class="language-css">.prose table {
  display: block;
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
</code></pre>
<p>Two habits worth keeping:</p>
<ol>
<li>Test at 360px before 1440px; the narrow case fails first.</li>
<li>Prefer <code>min()</code>, <code>max()</code> and <code>clamp()</code> over a breakpoint you have to keep in sync with a class name.</li>
</ol>
<blockquote>
<p>The best breakpoint is the one you did not have to write.</p>
</blockquote>
$html_4$, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80', 2, true, now() - interval '50 hours', now() - interval '49 hours'),
    ('20000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Shipping an Offline-First Angular App', 'shipping-an-offline-first-angular-app', $md_5$A reader on a train, in a lift, or on hotel wifi that stopped passing packets two minutes ago is indistinguishable from a healthy client until the first request times out. Designing for that state up front costs far less than retrofitting it.

## Decide what offline means for your product

There are three defensible answers and they cost very differently:

- Read-only fallback: bundled sample content, writes disabled.
- Cached reads: the last successful response is replayed from storage.
- Queued writes: mutations are stored and replayed on reconnect.

This application implements the first, because a demo that renders a blank error screen teaches a reader nothing.

## Put the fallback below the UI

If every component decides what to do when a request fails, the app ends up with as many offline behaviours as it has screens. Push the decision into the data layer instead:

```ts
async getPostBySlug(slug: string): Promise<PostDetail | null> {
  try {
    const remote = await this.fetchRemote(slug);

    this.markOnline();

    return remote;
  } catch {
    this.markOffline();

    return MOCK_POSTS.find((post) => post.slug === slug) ?? null;
  }
}
```

## Make the degraded state visible

| State | What the reader sees |
| --- | --- |
| Configured and reachable | live data, no extra chrome |
| Configured but unreachable | sample content plus one notice |
| Not configured | sample content plus one notice |

Three more rules that pay for themselves:

1. Never throw during bootstrap because an environment variable is missing.
2. Keep the fallback dataset structurally identical to the real one, or the types will fight you.
3. Disable writes instead of pretending they succeeded.

> Offline is a first-class state, not an error state.

The [MDN guide to offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) covers the caching half of the problem.$md_5$, $html_5$<p>A reader on a train, in a lift, or on hotel wifi that stopped passing packets two minutes ago is indistinguishable from a healthy client until the first request times out. Designing for that state up front costs far less than retrofitting it.</p>
<h2>Decide what offline means for your product</h2>
<p>There are three defensible answers and they cost very differently:</p>
<ul>
<li>Read-only fallback: bundled sample content, writes disabled.</li>
<li>Cached reads: the last successful response is replayed from storage.</li>
<li>Queued writes: mutations are stored and replayed on reconnect.</li>
</ul>
<p>This application implements the first, because a demo that renders a blank error screen teaches a reader nothing.</p>
<h2>Put the fallback below the UI</h2>
<p>If every component decides what to do when a request fails, the app ends up with as many offline behaviours as it has screens. Push the decision into the data layer instead:</p>
<pre><code class="language-ts">async getPostBySlug(slug: string): Promise&lt;PostDetail | null&gt; {
  try {
    const remote = await this.fetchRemote(slug);

    this.markOnline();

    return remote;
  } catch {
    this.markOffline();

    return MOCK_POSTS.find((post) =&gt; post.slug === slug) ?? null;
  }
}
</code></pre>
<h2>Make the degraded state visible</h2>
<table>
<thead>
<tr>
<th>State</th>
<th>What the reader sees</th>
</tr>
</thead>
<tbody><tr>
<td>Configured and reachable</td>
<td>live data, no extra chrome</td>
</tr>
<tr>
<td>Configured but unreachable</td>
<td>sample content plus one notice</td>
</tr>
<tr>
<td>Not configured</td>
<td>sample content plus one notice</td>
</tr>
</tbody></table>
<p>Three more rules that pay for themselves:</p>
<ol>
<li>Never throw during bootstrap because an environment variable is missing.</li>
<li>Keep the fallback dataset structurally identical to the real one, or the types will fight you.</li>
<li>Disable writes instead of pretending they succeeded.</li>
</ol>
<blockquote>
<p>Offline is a first-class state, not an error state.</p>
</blockquote>
<p>The <a target="_blank" rel="noopener noreferrer" href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation">MDN guide to offline and background operation</a> covers the caching half of the problem.</p>
$html_5$, 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&q=80', 2, true, now() - interval '74 hours', now() - interval '71 hours');

-- 5. Post/tag links.
insert into public.post_tags (post_id, tag_id)
values
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003');

-- 6. Comments, including nested replies. Inserted oldest first so every parent
--    row exists before the reply that references it.
insert into public.comments
    (id, post_id, author_id, parent_id, content_markdown, content_html, is_deleted, likes_count, created_at, updated_at)
values
    ('40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', null, $comment_md_1$Putting the fallback below the UI is the right call. Handling it per screen is how a codebase ends up with five different empty states and no shared vocabulary.$comment_md_1$, $comment_html_1$<p>Putting the fallback below the UI is the right call. Handling it per screen is how a codebase ends up with five different empty states and no shared vocabulary.</p>
$comment_html_1$, false, 0, now() - interval '72 hours', now() - interval '72 hours'),
    ('40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '40000000-0000-4000-8000-000000000010', $comment_md_2$It also keeps the components dumb, which is the only reason a single notice can cover every screen without being repeated five times.$comment_md_2$, $comment_html_2$<p>It also keeps the components dumb, which is the only reason a single notice can cover every screen without being repeated five times.</p>
$comment_html_2$, false, 0, now() - interval '71 hours', now() - interval '71 hours'),
    ('40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', null, $comment_md_3$min(100%, 18rem) inside minmax is the trick I keep re-learning. It is what stopped our tables from widening the page on a 360px phone.$comment_md_3$, $comment_html_3$<p>min(100%, 18rem) inside minmax is the trick I keep re-learning. It is what stopped our tables from widening the page on a 360px phone.</p>
$comment_html_3$, false, 0, now() - interval '49 hours', now() - interval '49 hours'),
    ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', null, $comment_md_4$The migration check-list matches what we did, except we also had to fix property initialiser order in two components. Nothing in the type errors pointed at it.$comment_md_4$, $comment_html_4$<p>The migration check-list matches what we did, except we also had to fix property initialiser order in two components. Nothing in the type errors pointed at it.</p>
$comment_html_4$, false, 0, now() - interval '26 hours', now() - interval '26 hours'),
    ('40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', '40000000-0000-4000-8000-000000000007', $comment_md_5$That is the sneaky one: field initialisers run before the decorator replacement is applied, so a decorated method can observe a half-built instance.$comment_md_5$, $comment_html_5$<p>That is the sneaky one: field initialisers run before the decorator replacement is applied, so a decorated method can observe a half-built instance.</p>
$comment_html_5$, false, 0, now() - interval '25 hours', now() - interval '25 hours'),
    ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', null, $comment_md_6$The USING versus WITH CHECK table is the clearest version of this I have read. It is also the reason I now review every update policy for a missing clause.$comment_md_6$, $comment_html_6$<p>The USING versus WITH CHECK table is the clearest version of this I have read. It is also the reason I now review every update policy for a missing clause.</p>
$comment_html_6$, false, 0, now() - interval '10 hours', now() - interval '10 hours'),
    ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '40000000-0000-4000-8000-000000000005', $comment_md_7$That reuse rule is what makes it subtle. The obvious attack is blocked either way, so a review that only tests behaviour will pass it.$comment_md_7$, $comment_html_7$<p>That reuse rule is what makes it subtle. The obvious attack is blocked either way, so a review that only tests behaviour will pass it.</p>
$comment_html_7$, false, 0, now() - interval '9 hours', now() - interval '9 hours'),
    ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', null, $comment_md_8$The dedupe step is the part most implementations skip. We hit exactly that double insert on a slow connection and spent an afternoon working out where the extra card came from.$comment_md_8$, $comment_html_8$<p>The dedupe step is the part most implementations skip. We hit exactly that double insert on a slow connection and spent an afternoon working out where the extra card came from.</p>
$comment_html_8$, false, 0, now() - interval '4 hours', now() - interval '4 hours'),
    ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '40000000-0000-4000-8000-000000000001', $comment_md_9$It is the same reason the cursor lives outside the list. Once both are keyed by id an in-flight page cannot corrupt the ordering.$comment_md_9$, $comment_html_9$<p>It is the same reason the cursor lives outside the list. Once both are keyed by id an in-flight page cannot corrupt the ordering.</p>
$comment_html_9$, false, 0, now() - interval '3 hours', now() - interval '3 hours'),
    ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', '40000000-0000-4000-8000-000000000002', $comment_md_10$Do you refetch the first page on SUBSCRIBED, or trust the payload to have everything the client missed?$comment_md_10$, $comment_html_10$<p>Do you refetch the first page on SUBSCRIBED, or trust the payload to have everything the client missed?</p>
$comment_html_10$, false, 0, now() - interval '3 hours', now() - interval '3 hours'),
    ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', null, $comment_md_11$Worth adding: enabling replication on a busy table is not free. We scoped ours to published posts and the write amplification dropped immediately.$comment_md_11$, $comment_html_11$<p>Worth adding: enabling replication on a busy table is not free. We scoped ours to published posts and the write amplification dropped immediately.</p>
$comment_html_11$, false, 0, now() - interval '2 hours', now() - interval '2 hours');

-- 7. Reactions on both posts and comments. The triggers maintain the counters,
--    which is why no counter column appears in this insert.
insert into public.reactions (user_id, post_id, comment_id, reaction)
values
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', null, 'like'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000001', null, 'like'),
    ('33333333-3333-4333-8333-333333333333', '20000000-0000-4000-8000-000000000001', null, 'like'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', null, 'unicorn'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000001', null, 'unicorn'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', null, 'exploding_head'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', null, 'raised_hands'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000001', null, 'raised_hands'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', null, 'fire'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', null, 'bookmark'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000001', null, 'bookmark'),
    ('33333333-3333-4333-8333-333333333333', '20000000-0000-4000-8000-000000000001', null, 'bookmark'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002', null, 'like'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000002', null, 'like'),
    ('33333333-3333-4333-8333-333333333333', '20000000-0000-4000-8000-000000000002', null, 'like'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002', null, 'unicorn'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002', null, 'exploding_head'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002', null, 'raised_hands'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002', null, 'fire'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002', null, 'bookmark'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000002', null, 'bookmark'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000003', null, 'like'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000003', null, 'like'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000003', null, 'unicorn'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000003', null, 'exploding_head'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000003', null, 'raised_hands'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000003', null, 'bookmark'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000004', null, 'like'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000004', null, 'like'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000004', null, 'unicorn'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000004', null, 'raised_hands'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000004', null, 'bookmark'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000005', null, 'like'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000005', null, 'like'),
    ('33333333-3333-4333-8333-333333333333', '20000000-0000-4000-8000-000000000005', null, 'like'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000005', null, 'unicorn'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000005', null, 'unicorn'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000005', null, 'exploding_head'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000005', null, 'raised_hands'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000005', null, 'raised_hands'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000005', null, 'fire'),
    ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000005', null, 'bookmark'),
    ('22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000005', null, 'bookmark'),
    ('33333333-3333-4333-8333-333333333333', '20000000-0000-4000-8000-000000000005', null, 'bookmark'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000010', 'like'),
    ('22222222-2222-4222-8222-222222222222', null, '40000000-0000-4000-8000-000000000010', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000011', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000009', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000007', 'like'),
    ('22222222-2222-4222-8222-222222222222', null, '40000000-0000-4000-8000-000000000007', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000008', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000005', 'like'),
    ('22222222-2222-4222-8222-222222222222', null, '40000000-0000-4000-8000-000000000005', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000006', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000001', 'like'),
    ('22222222-2222-4222-8222-222222222222', null, '40000000-0000-4000-8000-000000000001', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000002', 'like'),
    ('11111111-1111-4111-8111-111111111111', null, '40000000-0000-4000-8000-000000000004', 'like');

-- 8. Sanity check, still inside the transaction. A seed that silently inserts
--    nothing is worse than one that fails, and a failure here rolls the whole
--    transaction back instead of leaving half a dataset behind.
do $$
declare
    expected_posts constant integer := 5;
    expected_tags constant integer := 5;
    expected_comments constant integer := 11;
    expected_profiles constant integer := 3;
    actual_posts integer;
    actual_tags integer;
    actual_comments integer;
    actual_profiles integer;
    drifted_counters integer;
begin
    select count(*) into actual_posts from public.posts;
    select count(*) into actual_tags from public.tags;
    select count(*) into actual_comments from public.comments;
    select count(*) into actual_profiles from public.profiles where id in (
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333'
    );

    if actual_profiles <> expected_profiles then
        raise exception 'Seed expected % profiles, found %; did handle_new_user() run?', expected_profiles, actual_profiles;
    end if;

    if actual_posts <> expected_posts then
        raise exception 'Seed expected % posts, found %', expected_posts, actual_posts;
    end if;

    if actual_tags <> expected_tags then
        raise exception 'Seed expected % tags, found %', expected_tags, actual_tags;
    end if;

    if actual_comments <> expected_comments then
        raise exception 'Seed expected % comments, found %', expected_comments, actual_comments;
    end if;

    if exists (
        select 1
        from public.posts p
        where not exists (select 1 from public.post_tags pt where pt.post_id = p.id)
    ) then
        raise exception 'Seed left a post without tags';
    end if;

    -- The triggers must have produced counters that match the rows themselves.
    select count(*) into drifted_counters
    from public.comments c
    where c.likes_count <> (
        select count(*) from public.reactions r
        where r.comment_id = c.id and r.reaction = 'like'
    );

    if drifted_counters > 0 then
        raise exception 'Seed left % comments with a likes_count that does not match its reactions', drifted_counters;
    end if;

    select count(*) into drifted_counters
    from public.posts p
    where p.comments_count <> (
        select count(*) from public.comments c
        where c.post_id = p.id and c.is_deleted = false
    );

    if drifted_counters > 0 then
        raise exception 'Seed left % posts with a comments_count that does not match its comments', drifted_counters;
    end if;

    select count(*) into drifted_counters
    from public.posts p
    where p.reactions_count <> (
        select count(*) from public.reactions r where r.post_id = p.id
    );

    if drifted_counters > 0 then
        raise exception 'Seed left % posts with a reactions_count that does not match its reactions', drifted_counters;
    end if;

    raise notice 'Seed complete: % profiles, % posts, % tags, % comments.', actual_profiles, actual_posts, actual_tags, actual_comments;
end;
$$;

commit;
