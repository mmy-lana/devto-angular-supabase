import type { CommentFlatRow, CommentNode } from '../models/comment.model';
import type { PostDetail } from '../models/post.model';
import type { Profile, ProfileRow } from '../models/profile.model';
import {
  createEmptyReactionCounts,
  createEmptyUserReactions,
  type ReactionCountSummary,
} from '../models/reaction.model';
import type { Tag } from '../models/tag.model';
import type { TagWithCount } from '../services/tag.service';
import { buildCommentTree } from '../utils/comment-tree.builder';
import { calculateReadingTime, renderMarkdownToHtml } from '../utils/markdown.util';

/**
 * Bundled sample content used when Supabase is unconfigured or unreachable.
 *
 * This module is the single source of truth for the offline dataset: the same
 * posts, tags, comments and reactions are inserted by `supabase/seed.sql`, so a
 * reader cannot tell the two data sources apart. Every derived field is computed
 * here rather than typed out — HTML is rendered from the markdown, reading time
 * from the same estimator the editor uses, and reaction totals from the seeded
 * per-kind counts — which keeps the dataset internally consistent by
 * construction.
 *
 * The dataset is deliberately framework-free: it imports markdown helpers and
 * models, never Angular. That lets tooling bundle and execute it directly to
 * verify it against the database.
 */

/** Per-kind reaction counts; `total` is derived from these. */
type MockReactionCounts = Omit<ReactionCountSummary, 'total'>;

const HOUR_IN_MS = 3_600_000;

/** Fixed at module load so every offset below is stable for the whole session. */
const MOCK_NOW = Date.now();

/**
 * Epoch every timestamp in the dataset is measured from.
 *
 * `supabase/seed.sql` is generated from this module and writes each timestamp as
 * `now() - interval '<offset>'`, so the sample content always looks recent in a
 * freshly seeded database instead of carrying a frozen date.
 */
export const MOCK_DATASET_EPOCH = MOCK_NOW;

/** ISO timestamp for a point `hours` before the dataset was loaded. */
function hoursAgo(hours: number): string {
  return new Date(MOCK_NOW - hours * HOUR_IN_MS).toISOString();
}

/** Authors of the seeded posts, mirroring the `public.profiles` rows of the seed. */
const ALEX_RIVERA: Profile = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'alex_dev',
  fullName: 'Alex Rivera',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=alex_dev',
  bio: 'Fullstack engineer. Postgres, TypeScript and the parts of the browser nobody reads about.',
  websiteUrl: 'https://alexrivera.dev',
  githubUsername: 'alexrivera',
  twitterUsername: 'alexrivera_dev',
  createdAt: '2021-03-14T09:12:00.000Z',
  updatedAt: '2024-11-02T18:40:00.000Z',
};

const SARAH_CHEN: Profile = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'sarah_codes',
  fullName: 'Sarah Chen',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=sarah_codes',
  bio: 'Database reliability engineer. Row level security, migrations and the tests that catch them.',
  websiteUrl: 'https://sarahchen.dev',
  githubUsername: 'sarahcodes',
  twitterUsername: 'sarah_codes',
  createdAt: '2020-08-01T07:05:00.000Z',
  updatedAt: '2024-10-21T12:15:00.000Z',
};

const MARCUS_BELL: Profile = {
  id: '33333333-3333-4333-8333-333333333333',
  username: 'marcus_tech',
  fullName: 'Marcus Bell',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=marcus_tech',
  bio: 'Frontend infrastructure. Compilers, design systems and build tooling.',
  websiteUrl: 'https://marcusbell.io',
  githubUsername: 'marcusbell',
  twitterUsername: 'marcus_tech',
  createdAt: '2019-05-30T15:45:00.000Z',
  updatedAt: '2024-09-18T08:30:00.000Z',
};

/** Every author in the dataset, keyed by profile id. */
const AUTHORS: Record<string, Profile> = {
  [ALEX_RIVERA.id]: ALEX_RIVERA,
  [SARAH_CHEN.id]: SARAH_CHEN,
  [MARCUS_BELL.id]: MARCUS_BELL,
};

/** Tag catalogue, mirroring the `public.tags` rows of the seed. */
const TAGS: Record<string, Tag> = {
  webdev: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'webdev',
    displayName: 'WebDev',
    hexColor: '#3b49df',
    bgColor: '#ebedf8',
    description: 'Building for the web: browsers, HTTP, performance and everything in between.',
    createdAt: '2024-01-05T10:00:00.000Z',
  },
  angular: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'angular',
    displayName: 'Angular',
    hexColor: '#dd0031',
    bgColor: '#fde8eb',
    description: 'Components, signals, routing and the Angular build pipeline.',
    createdAt: '2024-01-05T10:00:00.000Z',
  },
  typescript: {
    id: '10000000-0000-4000-8000-000000000003',
    name: 'typescript',
    displayName: 'TypeScript',
    hexColor: '#3178c6',
    bgColor: '#eaf2fa',
    description: 'Types, generics, decorators and type-safe application design.',
    createdAt: '2024-01-05T10:00:00.000Z',
  },
  supabase: {
    id: '10000000-0000-4000-8000-000000000004',
    name: 'supabase',
    displayName: 'Supabase',
    hexColor: '#1f9d6b',
    bgColor: '#e6f7f0',
    description: 'Postgres, row level security, realtime and the Supabase platform.',
    createdAt: '2024-01-05T10:00:00.000Z',
  },
  css: {
    id: '10000000-0000-4000-8000-000000000005',
    name: 'css',
    displayName: 'CSS',
    hexColor: '#264de4',
    bgColor: '#e9eefc',
    description: 'Layout, typography and modern responsive techniques.',
    createdAt: '2024-01-05T10:00:00.000Z',
  },
};

const POST_1_MARKDOWN = `Supabase streams Postgres changes over a websocket, and Angular ships a reactivity primitive that fits that shape well. Together they make a live feed small enough to reason about on one screen of code.

This post walks through the shape I use in production: a signal that owns the page of posts, a channel that patches it in place, and a reconnect path that never duplicates a card.

## Why a refresh loop fails

Polling every few seconds is the easiest thing to reach for, and the most expensive:

- Every client re-reads rows it already has.
- The request rate scales with the number of open tabs, not with the number of new posts.
- A slow response can land after a newer one and move the list backwards.

Realtime changes invert that: the server pushes one row and the client decides what it means.

## Model the page as a signal

The feed is a signal of summaries plus a cursor. Nothing else is stateful:

\`\`\`ts
readonly posts = signal<PostSummary[]>([]);
private cursor: FeedCursor | null = null;

async loadNextPage(filter: FeedFilter): Promise<void> {
  const page = await this.fetchPage(filter, this.cursor);

  this.posts.update((current) => dedupeById([...current, ...page.rows]));
  this.cursor = page.cursor;
}
\`\`\`

\`dedupeById\` is the important part. A realtime insert that arrives while a page is in flight is delivered twice: once by the channel, once by the query that already included it. Keying by id makes that idempotent.

## Subscribe server-side

Enable replication for the tables you need, then filter in the subscription:

\`\`\`sql
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.comments;
\`\`\`

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

The [Supabase Realtime guide](https://supabase.com/docs/guides/realtime) covers the channel API, and the [PostgREST reference](https://postgrest.org/en/stable/references/api/tables_views.html) documents the filters the cursor relies on.`;

const POST_2_MARKDOWN = `Row level security is the only thing standing between your anon key and your data. It is also the part of a Supabase project that is easiest to get subtly wrong, because a missing policy fails open at the table level and closed at the row level in ways that are hard to spot in review.

## The default is not safe

A table without RLS enabled is readable by anyone holding the anon key. Enabling RLS with no policy makes it readable by nobody. Neither state is a decision somebody made, so write it down:

\`\`\`sql
alter table public.posts enable row level security;

create policy "Public posts are viewable by everyone"
  on public.posts for select
  using (published = true or auth.uid() = author_id);
\`\`\`

## USING answers which rows, WITH CHECK answers which writes

\`USING\` filters the rows a statement can see. \`WITH CHECK\` validates the row a statement wants to store. On an update, \`USING\` is evaluated against the row as it exists and \`WITH CHECK\` against the row as it would exist afterwards.

Postgres reuses \`USING\` as the check when no \`WITH CHECK\` is given, which is why an omitted clause survives review: the obvious attack still fails. The cost is that the guarantee is implicit, and the moment somebody extends \`USING\` the write path changes with it.

| Statement | USING | WITH CHECK |
| --- | --- | --- |
| SELECT | yes | not evaluated |
| INSERT | no | yes |
| UPDATE | yes | yes |
| DELETE | yes | no |

## Ownership on join tables

A join row has no owner column, so the predicate has to travel through its parent:

\`\`\`sql
create policy "Post authors can insert post tags"
  on public.post_tags for insert
  with check (
    exists (
      select 1 from public.posts
      where id = post_id and author_id = auth.uid()
    )
  );
\`\`\`

Three habits keep this honest:

- Write the negative test first: can user B edit user A's row?
- Keep one policy per verb rather than a single \`for all\` policy.
- Re-check ownership on update, not only on select.

Treat metadata as input too. The trigger that mirrors \`auth.users\` into \`public.profiles\` reads user controlled JSON, and a value that violates a check constraint aborts the surrounding transaction — including the sign-up that triggered it.`;

const POST_3_MARKDOWN = `The decorator proposal TypeScript implemented in 2015 was never standardised in that form. The proposal that did reach stage 3 is what the compiler emits when \`experimentalDecorators\` is off, and the two are not compatible with each other.

## What actually changed

The legacy implementation called a function with the class, the property key and a property descriptor, and let it replace the target. The standard implementation calls a function with a value and a context object, and lets it return a replacement for that value:

\`\`\`ts
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
\`\`\`

## Why it matters even if you write none

Angular, Nest and TypeORM all build on decorators. When the underlying semantics change, the framework contract changes with them.

| Aspect | Legacy | Standard |
| --- | --- | --- |
| Class access | available at decoration time | not provided |
| Return value | may replace the descriptor | may replace the decorated value |
| Metadata | reflect-metadata | context.metadata |
| Initialisers | run after decoration | run before the replacement applies |

## Migration check-list

1. Turn off \`experimentalDecorators\` and \`emitDecoratorMetadata\` and compile.
2. Replace descriptor mutation with a returned replacement.
3. Move injected metadata to \`context.metadata\`.
4. Re-run the suite: failures cluster around property initialisation order.

> Decorators are not magic. They are a function call with a compile-time guarantee about the shape of its arguments.

Read the [TC39 proposal](https://github.com/tc39/proposal-decorators) next to the [TypeScript 5 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/).`;

const POST_4_MARKDOWN = `Most media-query spaghetti is a symptom rather than a cause: the layout was written for one viewport and then patched for every other one. Intrinsic layout asks the browser to solve the same problem from constraints instead of breakpoints.

## Start from the constraints you already have

Every element has a natural width, a minimum content width and whatever space its parent offers. Modern CSS exposes all three:

\`\`\`css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}
\`\`\`

\`auto-fit\` with \`minmax()\` gives a responsive grid with no breakpoints at all. The inner \`min(100%, 18rem)\` is what stops a track from overflowing a 320px container that is narrower than the track itself.

## Fluid type with a floor

\`clamp()\` is the same idea applied to typography:

\`\`\`css
:root {
  --step-2: clamp(1.5rem, 1.2rem + 1.2vw, 2rem);
}

.post-title {
  font-size: var(--step-2);
  overflow-wrap: anywhere;
}
\`\`\`

| Technique | Replaces | Watch out for |
| --- | --- | --- |
| auto-fit grid | column-count breakpoints | empty tracks when there are few items |
| clamp() | font-size breakpoints | a floor that is too small to read |
| flex-wrap | float hacks | tall ragged rows |
| overflow-x: auto | a horizontally scrolling page | keyboard traps inside the scroller |

## Wide content should scroll inside itself

Tables, long code lines and embedded diagrams must never widen the page:

\`\`\`css
.prose table {
  display: block;
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
\`\`\`

Two habits worth keeping:

1. Test at 360px before 1440px; the narrow case fails first.
2. Prefer \`min()\`, \`max()\` and \`clamp()\` over a breakpoint you have to keep in sync with a class name.

> The best breakpoint is the one you did not have to write.`;

const POST_5_MARKDOWN = `A reader on a train, in a lift, or on hotel wifi that stopped passing packets two minutes ago is indistinguishable from a healthy client until the first request times out. Designing for that state up front costs far less than retrofitting it.

## Decide what offline means for your product

There are three defensible answers and they cost very differently:

- Read-only fallback: bundled sample content, writes disabled.
- Cached reads: the last successful response is replayed from storage.
- Queued writes: mutations are stored and replayed on reconnect.

This application implements the first, because a demo that renders a blank error screen teaches a reader nothing.

## Put the fallback below the UI

If every component decides what to do when a request fails, the app ends up with as many offline behaviours as it has screens. Push the decision into the data layer instead:

\`\`\`ts
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
\`\`\`

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

The [MDN guide to offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) covers the caching half of the problem.`;

/** A post before its derived fields are computed. */
interface MockPostSeed {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  coverImageUrl: string;
  tagNames: readonly string[];
  markdown: string;
  createdAtHoursAgo: number;
  updatedAtHoursAgo: number;
  reactionCounts: MockReactionCounts;
}

const POST_SEEDS: readonly MockPostSeed[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    authorId: ALEX_RIVERA.id,
    title: 'Building a Realtime Feed with Angular Signals and Supabase',
    slug: 'building-a-realtime-feed-with-angular-signals-and-supabase',
    coverImageUrl:
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80',
    tagNames: ['angular', 'supabase', 'typescript'],
    markdown: POST_1_MARKDOWN,
    createdAtHoursAgo: 5,
    updatedAtHoursAgo: 4,
    reactionCounts: {
      like: 3,
      unicorn: 2,
      exploding_head: 1,
      raised_hands: 2,
      fire: 1,
      bookmark: 3,
    },
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    authorId: SARAH_CHEN.id,
    title: 'Row Level Security Patterns for Supabase Apps',
    slug: 'row-level-security-patterns-for-supabase-apps',
    coverImageUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    tagNames: ['supabase', 'webdev'],
    markdown: POST_2_MARKDOWN,
    createdAtHoursAgo: 11,
    updatedAtHoursAgo: 10,
    reactionCounts: {
      like: 3,
      unicorn: 1,
      exploding_head: 1,
      raised_hands: 1,
      fire: 1,
      bookmark: 2,
    },
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    authorId: MARCUS_BELL.id,
    title: 'TypeScript Decorators: What Changed and Why It Matters',
    slug: 'typescript-decorators-what-changed-and-why-it-matters',
    coverImageUrl:
      'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80',
    tagNames: ['typescript', 'webdev'],
    markdown: POST_3_MARKDOWN,
    createdAtHoursAgo: 27,
    updatedAtHoursAgo: 26,
    reactionCounts: {
      like: 2,
      unicorn: 1,
      exploding_head: 1,
      raised_hands: 1,
      fire: 0,
      bookmark: 1,
    },
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    authorId: SARAH_CHEN.id,
    title: 'Modern CSS Layout Without Media Query Spaghetti',
    slug: 'modern-css-layout-without-media-query-spaghetti',
    coverImageUrl:
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
    tagNames: ['css', 'webdev'],
    markdown: POST_4_MARKDOWN,
    createdAtHoursAgo: 50,
    updatedAtHoursAgo: 49,
    reactionCounts: {
      like: 2,
      unicorn: 1,
      exploding_head: 0,
      raised_hands: 1,
      fire: 0,
      bookmark: 1,
    },
  },
  {
    id: '20000000-0000-4000-8000-000000000005',
    authorId: ALEX_RIVERA.id,
    title: 'Shipping an Offline-First Angular App',
    slug: 'shipping-an-offline-first-angular-app',
    coverImageUrl:
      'https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&q=80',
    tagNames: ['angular', 'webdev', 'typescript'],
    markdown: POST_5_MARKDOWN,
    createdAtHoursAgo: 74,
    updatedAtHoursAgo: 71,
    reactionCounts: {
      like: 3,
      unicorn: 2,
      exploding_head: 1,
      raised_hands: 2,
      fire: 1,
      bookmark: 3,
    },
  },
];

/** A comment before its derived fields and tree position are computed. */
interface MockCommentSeed {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  markdown: string;
  createdAtHoursAgo: number;
  /** Author ids that liked the comment; the count is derived from the list. */
  likedBy: readonly string[];
}

const COMMENT_SEEDS: readonly MockCommentSeed[] = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    postId: POST_SEEDS[0].id,
    authorId: SARAH_CHEN.id,
    parentId: null,
    markdown:
      'The dedupe step is the part most implementations skip. We hit exactly that double insert on a slow connection and spent an afternoon working out where the extra card came from.',
    createdAtHoursAgo: 4,
    likedBy: [ALEX_RIVERA.id, MARCUS_BELL.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    postId: POST_SEEDS[0].id,
    authorId: ALEX_RIVERA.id,
    parentId: '40000000-0000-4000-8000-000000000001',
    markdown:
      'It is the same reason the cursor lives outside the list. Once both are keyed by id an in-flight page cannot corrupt the ordering.',
    createdAtHoursAgo: 3,
    likedBy: [SARAH_CHEN.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    postId: POST_SEEDS[0].id,
    authorId: MARCUS_BELL.id,
    parentId: '40000000-0000-4000-8000-000000000002',
    markdown:
      'Do you refetch the first page on SUBSCRIBED, or trust the payload to have everything the client missed?',
    createdAtHoursAgo: 3,
    likedBy: [],
  },
  {
    id: '40000000-0000-4000-8000-000000000004',
    postId: POST_SEEDS[0].id,
    authorId: MARCUS_BELL.id,
    parentId: null,
    markdown:
      'Worth adding: enabling replication on a busy table is not free. We scoped ours to published posts and the write amplification dropped immediately.',
    createdAtHoursAgo: 2,
    likedBy: [ALEX_RIVERA.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000005',
    postId: POST_SEEDS[1].id,
    authorId: MARCUS_BELL.id,
    parentId: null,
    markdown:
      'The USING versus WITH CHECK table is the clearest version of this I have read. It is also the reason I now review every update policy for a missing clause.',
    createdAtHoursAgo: 10,
    likedBy: [SARAH_CHEN.id, ALEX_RIVERA.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000006',
    postId: POST_SEEDS[1].id,
    authorId: SARAH_CHEN.id,
    parentId: '40000000-0000-4000-8000-000000000005',
    markdown:
      'That reuse rule is what makes it subtle. The obvious attack is blocked either way, so a review that only tests behaviour will pass it.',
    createdAtHoursAgo: 9,
    likedBy: [MARCUS_BELL.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000007',
    postId: POST_SEEDS[2].id,
    authorId: ALEX_RIVERA.id,
    parentId: null,
    markdown:
      'The migration check-list matches what we did, except we also had to fix property initialiser order in two components. Nothing in the type errors pointed at it.',
    createdAtHoursAgo: 26,
    likedBy: [SARAH_CHEN.id, MARCUS_BELL.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000008',
    postId: POST_SEEDS[2].id,
    authorId: MARCUS_BELL.id,
    parentId: '40000000-0000-4000-8000-000000000007',
    markdown:
      'That is the sneaky one: field initialisers run before the decorator replacement is applied, so a decorated method can observe a half-built instance.',
    createdAtHoursAgo: 25,
    likedBy: [ALEX_RIVERA.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000009',
    postId: POST_SEEDS[3].id,
    authorId: ALEX_RIVERA.id,
    parentId: null,
    markdown:
      'min(100%, 18rem) inside minmax is the trick I keep re-learning. It is what stopped our tables from widening the page on a 360px phone.',
    createdAtHoursAgo: 49,
    likedBy: [SARAH_CHEN.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000010',
    postId: POST_SEEDS[4].id,
    authorId: SARAH_CHEN.id,
    parentId: null,
    markdown:
      'Putting the fallback below the UI is the right call. Handling it per screen is how a codebase ends up with five different empty states and no shared vocabulary.',
    createdAtHoursAgo: 72,
    likedBy: [ALEX_RIVERA.id, MARCUS_BELL.id],
  },
  {
    id: '40000000-0000-4000-8000-000000000011',
    postId: POST_SEEDS[4].id,
    authorId: ALEX_RIVERA.id,
    parentId: '40000000-0000-4000-8000-000000000010',
    markdown:
      'It also keeps the components dumb, which is the only reason a single notice can cover every screen without being repeated five times.',
    createdAtHoursAgo: 71,
    likedBy: [SARAH_CHEN.id],
  },
];

/** `ProfileRow` form of a profile, as the tree builder receives it from PostgREST. */
function toProfileRow(profile: Profile): ProfileRow {
  return {
    id: profile.id,
    username: profile.username,
    full_name: profile.fullName,
    avatar_url: profile.avatarUrl,
    bio: profile.bio,
    website_url: profile.websiteUrl,
    github_username: profile.githubUsername,
    twitter_username: profile.twitterUsername,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

/**
 * Builds the comment trees with the same builder the live stream uses, so the
 * offline discussion nests, orders and clamps depth exactly like the real one.
 */
function buildMockComments(): Record<string, CommentNode[]> {
  const rowsByPost = new Map<string, CommentFlatRow[]>();

  for (const seed of COMMENT_SEEDS) {
    const author = AUTHORS[seed.authorId];
    const createdAt = hoursAgo(seed.createdAtHoursAgo);
    const rows = rowsByPost.get(seed.postId) ?? [];

    rows.push({
      id: seed.id,
      post_id: seed.postId,
      author_id: seed.authorId,
      parent_id: seed.parentId,
      content_markdown: seed.markdown,
      content_html: renderMarkdownToHtml(seed.markdown),
      is_deleted: false,
      likes_count: seed.likedBy.length,
      created_at: createdAt,
      updated_at: createdAt,
      profiles: toProfileRow(author),
    });

    rowsByPost.set(seed.postId, rows);
  }

  const trees: Record<string, CommentNode[]> = {};

  for (const post of POST_SEEDS) {
    trees[post.id] = buildCommentTree(rowsByPost.get(post.id) ?? []);
  }

  return trees;
}

/** Comment trees per post id, keyed exactly like `CommentService` looks them up. */
export const MOCK_COMMENTS: Record<string, CommentNode[]> = buildMockComments();

/** Total number of active comments a post has in the dataset (DATA-04). */
function countPostComments(postId: string): number {
  const countNodes = (nodes: CommentNode[]): number =>
    nodes.reduce(
      (total, node) => total + (node.isDeleted ? 0 : 1) + countNodes(node.replies),
      0,
    );

  return countNodes(MOCK_COMMENTS[postId] ?? []);
}

/** Sums the per-kind counts into the denormalised total the feed sorts on. */
function totalReactions(counts: MockReactionCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function buildMockPosts(): PostDetail[] {
  return POST_SEEDS.map((seed) => ({
    id: seed.id,
    authorId: seed.authorId,
    title: seed.title,
    slug: seed.slug,
    coverImageUrl: seed.coverImageUrl,
    readingTimeMinutes: calculateReadingTime(seed.markdown),
    published: true,
    reactionsCount: totalReactions(seed.reactionCounts),
    commentsCount: countPostComments(seed.id),
    createdAt: hoursAgo(seed.createdAtHoursAgo),
    updatedAt: hoursAgo(seed.updatedAtHoursAgo),
    author: AUTHORS[seed.authorId],
    tags: seed.tagNames.map((name) => TAGS[name]),
    // The offline dataset serves anonymous readers, so nothing is pre-reacted.
    userReactions: createEmptyUserReactions(),
    contentMarkdown: seed.markdown,
    contentHtml: renderMarkdownToHtml(seed.markdown),
  }));
}

/** The five bundled posts, newest first — the same rows `supabase/seed.sql` writes. */
export const MOCK_POSTS: PostDetail[] = buildMockPosts();

/** Post counts per tag, derived from the bundled posts rather than typed out. */
export const MOCK_TAGS: TagWithCount[] = Object.values(TAGS)
  .map((tag) => ({
    ...tag,
    postsCount: MOCK_POSTS.filter((post) => post.tags.some((candidate) => candidate.id === tag.id))
      .length,
  }))
  .sort((a, b) => b.postsCount - a.postsCount || a.name.localeCompare(b.name));

/** Per-kind reaction breakdown of a bundled post, used when counters are offline. */
export function mockReactionCountsForPost(postId: string): ReactionCountSummary {
  const seed = POST_SEEDS.find((candidate) => candidate.id === postId);

  if (!seed) {
    return createEmptyReactionCounts();
  }

  return { ...seed.reactionCounts, total: totalReactions(seed.reactionCounts) };
}

/** Looks up a bundled post by slug, mirroring the `posts.slug` lookup. */
export function findMockPostBySlug(slug: string): PostDetail | null {
  return MOCK_POSTS.find((post) => post.slug === slug) ?? null;
}
