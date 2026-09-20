/**
 * Generates `supabase/seed.sql` from the offline dataset.
 *
 * `src/app/core/mocks/devto-mock-data.ts` is the single source of truth: this
 * script loads that module through Vite's SSR module runner, executes it, and
 * writes the SQL that inserts exactly the same profiles, tags, posts, comments
 * and reactions. Both artifacts therefore describe one dataset, and re-running
 * the script is how a change to the sample content reaches the database.
 *
 * Usage: `pnpm seed:generate` (or `node scripts/generate-seed.mjs`).
 * The generated file is committed, so the app never depends on this script at
 * build or run time.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const mockModulePath = join(projectRoot, 'src/app/core/mocks/devto-mock-data.ts');
const seedPath = join(projectRoot, 'supabase/seed.sql');

/** Reaction kinds in the order the toolbar renders them. */
const REACTION_KINDS = [
  'like',
  'unicorn',
  'exploding_head',
  'raised_hands',
  'fire',
  'bookmark',
];

/** Authors, in the order reaction rows are dealt out to them. */
const AUTHOR_ORDER = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

/** Hour offset of an ISO timestamp relative to the dataset epoch. */
function hoursBeforeEpoch(epoch, isoTimestamp) {
  return Math.round((epoch - Date.parse(isoTimestamp)) / 3_600_000);
}

/** Renders an offset as the SQL interval the seed stores. */
function interval(hours) {
  return hours === 1 ? `now() - interval '1 hour'` : `now() - interval '${hours} hours'`;
}

/** Single-quoted SQL literal. */
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Dollar-quoted SQL literal, tagged per value so nested quotes cannot escape. */
function dollarQuote(tag, value) {
  const text = String(value);

  if (text.includes(`$${tag}$`)) {
    throw new Error(`Value for ${tag} contains its own dollar-quote tag.`);
  }

  return `$${tag}$${text}$${tag}$`;
}

/** Flattens a comment tree into creation order, parents before their replies. */
function flattenComments(trees) {
  const flat = [];

  const visit = (nodes) => {
    for (const node of nodes) {
      flat.push(node);
      visit(node.replies);
    }
  };

  for (const tree of Object.values(trees)) {
    visit(tree);
  }

  return flat.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Deals `count` distinct authors to a write, cycling the author list. */
function dealAuthors(count) {
  const authors = [];

  for (let index = 0; index < count; index += 1) {
    authors.push(AUTHOR_ORDER[index % AUTHOR_ORDER.length]);
  }

  return authors;
}

/**
 * Loads the dataset module by executing it.
 *
 * Vite is already a direct dev dependency and its SSR module runner transpiles
 * TypeScript on demand, so the dataset can be executed exactly as the browser
 * would execute it — no build step, no duplicated copy of the content.
 */
async function loadDataset() {
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
  });

  try {
    const dataset = await server.ssrLoadModule(mockModulePath);

    if (dataset.MOCK_POSTS.length !== 5) {
      throw new Error(`Expected 5 posts in the dataset, found ${dataset.MOCK_POSTS.length}.`);
    }

    return dataset;
  } finally {
    await server.close();
  }
}

/** Distinct authors of the dataset, in the order they first appear. */
function authorsOf(posts) {
  const authors = new Map();

  for (const post of posts) {
    authors.set(post.author.id, post.author);
  }

  return [...authors.values()];
}

function renderProfiles(posts) {
  const authors = authorsOf(posts);

  const rows = authors.map((author) => {
    const meta = JSON.stringify({
      user_name: author.username,
      full_name: author.fullName,
      avatar_url: author.avatarUrl,
    });

    const columns = [
      quote(author.id),
      "'00000000-0000-0000-0000-000000000000'",
      "'authenticated'",
      "'authenticated'",
      quote(`${author.username}@devto.example`),
      'now()',
      `'{"provider":"email","providers":["email"]}'::jsonb`,
      `${quote(meta)}::jsonb`,
      'now()',
      'now()',
    ];

    return `    (${columns.join(', ')})`;
  });

  return `-- Identities own the profile rows: public.profiles.id references auth.users,
-- so the accounts have to exist first and public.handle_new_user() creates the
-- profile while inserting them. The update that follows fills in the fields the
-- trigger does not know about.
insert into auth.users
    (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
${rows.join(',\n')}
on conflict (id) do nothing;`;
}

function renderProfileDetails(posts) {
  const authors = authorsOf(posts);

  const rows = authors.map((author) => {
    const columns = [
      `${quote(author.id)}::uuid`,
      quote(author.username),
      quote(author.fullName),
      quote(author.avatarUrl),
      quote(author.bio),
      quote(author.websiteUrl),
      quote(author.githubUsername),
      quote(author.twitterUsername),
      `${quote(author.createdAt)}::timestamptz`,
      `${quote(author.updatedAt)}::timestamptz`,
    ];

    return `        (${columns.join(', ')})`;
  });

  return `update public.profiles as profile
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
${rows.join(',\n')}
) as seed (id, username, full_name, avatar_url, bio, website_url, github_username, twitter_username, created_at, updated_at)
where profile.id = seed.id;`;
}

function renderTags(tags) {
  const rows = tags.map((tag) => {
    const columns = [
      quote(tag.id),
      quote(tag.name),
      quote(tag.displayName),
      quote(tag.hexColor),
      quote(tag.bgColor),
      quote(tag.description),
      quote(tag.createdAt),
    ];

    return `    (${columns.join(', ')})`;
  });

  return `insert into public.tags
    (id, name, display_name, hex_color, bg_color, description, created_at)
values
${rows.join(',\n')};`;
}

function renderPosts(posts, epoch) {
  const rows = posts.map((post, index) => {
    const position = index + 1;
    const columns = [
      quote(post.id),
      quote(post.authorId),
      quote(post.title),
      quote(post.slug),
      dollarQuote(`md_${position}`, post.contentMarkdown),
      dollarQuote(`html_${position}`, post.contentHtml),
      quote(post.coverImageUrl),
      String(post.readingTimeMinutes),
      'true',
      interval(hoursBeforeEpoch(epoch, post.createdAt)),
      interval(hoursBeforeEpoch(epoch, post.updatedAt)),
    ];

    return `    (${columns.join(', ')})`;
  });

  return `insert into public.posts
    (id, author_id, title, slug, content_markdown, content_html, cover_image_url, reading_time_minutes, published, created_at, updated_at)
values
${rows.join(',\n')};`;
}

function renderPostTags(posts, tags) {
  const rows = [];
  const knownTagIds = new Set(tags.map((tag) => tag.id));

  for (const post of posts) {
    for (const tag of post.tags) {
      if (!knownTagIds.has(tag.id)) {
        throw new Error(`Post ${post.slug} references tag ${tag.name}, which is not in MOCK_TAGS.`);
      }

      rows.push(`    (${quote(post.id)}, ${quote(tag.id)})`);
    }
  }

  if (rows.length === 0) {
    throw new Error('No post/tag links to seed.');
  }

  return `insert into public.post_tags (post_id, tag_id)
values
${rows.join(',\n')};`;
}

function renderComments(comments, epoch) {
  const rows = comments.map((comment, index) => {
    const position = index + 1;
    const columns = [
      quote(comment.id),
      quote(comment.postId),
      quote(comment.authorId),
      comment.parentId === null ? 'null' : quote(comment.parentId),
      dollarQuote(`comment_md_${position}`, comment.contentMarkdown),
      dollarQuote(`comment_html_${position}`, comment.contentHtml),
      'false',
      // Left at zero on purpose: trg_comment_like_count increments it once per
      // like reaction inserted below, so writing the count here as well would
      // double it.
      '0',
      interval(hoursBeforeEpoch(epoch, comment.createdAt)),
      interval(hoursBeforeEpoch(epoch, comment.updatedAt)),
    ];

    return `    (${columns.join(', ')})`;
  });

  return `insert into public.comments
    (id, post_id, author_id, parent_id, content_markdown, content_html, is_deleted, likes_count, created_at, updated_at)
values
${rows.join(',\n')};`;
}

function renderReactions(posts, comments, reactionCountsForPost) {
  const rows = [];

  for (const post of posts) {
    const counts = reactionCountsForPost(post.id);

    for (const kind of REACTION_KINDS) {
      for (const authorId of dealAuthors(counts[kind])) {
        rows.push(`    (${quote(authorId)}, ${quote(post.id)}, null, ${quote(kind)})`);
      }
    }
  }

  for (const comment of comments) {
    for (const authorId of dealAuthors(comment.likesCount)) {
      rows.push(`    (${quote(authorId)}, null, ${quote(comment.id)}, 'like')`);
    }
  }

  return `insert into public.reactions (user_id, post_id, comment_id, reaction)
values
${rows.join(',\n')};`;
}

function renderReset(posts) {
  const ids = authorsOf(posts)
    .map((author) => `    ${quote(author.id)}`)
    .join(',\n');

  return `-- The sample accounts are removed first: public.profiles references
-- auth.users, so the trigger cannot recreate the profile rows while the old
-- identities are still present. Deleting them cascades to the sample profiles
-- and their content, after which the content tables are emptied wholesale so a
-- re-run never appends a second copy of the dataset. Profiles belonging to
-- accounts created through the running application are left alone.
delete from auth.users where id in (
${ids}
);

delete from public.profiles where id in (
${ids}
);

truncate table
    public.reactions,
    public.comments,
    public.post_tags,
    public.posts,
    public.tags
cascade;`;
}

function renderSeed(dataset) {
  const { MOCK_POSTS, MOCK_TAGS, MOCK_COMMENTS, MOCK_DATASET_EPOCH, mockReactionCountsForPost } =
    dataset;
  const comments = flattenComments(MOCK_COMMENTS);
  const tags = [...MOCK_TAGS].sort((a, b) => a.name.localeCompare(b.name));
  const authors = authorsOf(MOCK_POSTS);

  return `-- Dev.to mock platform — docker seed data.
--
-- GENERATED FILE: do not edit the content below by hand.
-- Source of truth: src/app/core/mocks/devto-mock-data.ts
-- Regenerate with: pnpm seed:generate
--
-- The dataset is also the offline fallback dataset. Both describe the same
-- ${authors.length} authors, ${tags.length} tags, ${MOCK_POSTS.length} posts, ${comments.length} comments and their reactions, so a
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
${renderReset(MOCK_POSTS)}

-- 1. Accounts. Real profiles are always created by the on_auth_user_created
--    trigger, never by the application, so the seed registers the identities and
--    lets the trigger mirror them.
${renderProfiles(MOCK_POSTS)}

-- 2. Profile details the trigger does not know about.
${renderProfileDetails(MOCK_POSTS)}

-- 3. Tags, ordered by name to match the catalogue query.
${renderTags(tags)}

-- 4. Posts. content_html and reading_time_minutes are produced from
--    content_markdown by the same renderer the application uses.
${renderPosts(MOCK_POSTS, MOCK_DATASET_EPOCH)}

-- 5. Post/tag links.
${renderPostTags(MOCK_POSTS, tags)}

-- 6. Comments, including nested replies. Inserted oldest first so every parent
--    row exists before the reply that references it.
${renderComments(comments, MOCK_DATASET_EPOCH)}

-- 7. Reactions on both posts and comments. The triggers maintain the counters,
--    which is why no counter column appears in this insert.
${renderReactions(MOCK_POSTS, comments, mockReactionCountsForPost)}

-- 8. Sanity check, still inside the transaction. A seed that silently inserts
--    nothing is worse than one that fails, and a failure here rolls the whole
--    transaction back instead of leaving half a dataset behind.
do $$
declare
    expected_posts constant integer := ${MOCK_POSTS.length};
    expected_tags constant integer := ${tags.length};
    expected_comments constant integer := ${comments.length};
    expected_profiles constant integer := ${authors.length};
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
        ${authors.map((author) => `'${author.id}'`).join(',\n        ')}
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
`;
}

const dataset = await loadDataset();
const seed = renderSeed(dataset);

await writeFile(seedPath, seed, 'utf8');

console.log(`Wrote ${seedPath} (${seed.split('\n').length} lines).`);
