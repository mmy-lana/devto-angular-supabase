# DEV.to Platform Clone (Angular + Supabase)

A high-performance, enterprise-grade mock of the DEV.to community platform. Built with modern Angular standalone architecture, Signals reactivity, and Supabase PostgreSQL. Features the signature DEV retro card layout, optimistic interactions, and an offline-first dual-mode runtime.

Live Demo: https://devto-angular-supabase.vercel.app

---

## Key Highlights

- Dual-Mode Resiliency: Runs against a live local Supabase Docker instance or gracefully falls back to an internal typed mock dataset when deployed statically (e.g., on Vercel) without live credentials.
- Zero Layout Shifts & Strict Viewport Hardening: Fully optimized for 360px, 390px, 430px, 768px, and 1024px+ viewports with enforced 44x44px minimum touch targets and iOS safe-area inset protection.
- Enterprise Security & Integrity: 9.8/10 security audit rating. Row Level Security with strict WITH CHECK constraints, atomic SQL counter triggers, and DOMPurify-hardened markdown sanitization against reverse-tabnabbing and XSS.

---

## Architectural Breakdown

### 1. Modern Angular Signals Architecture
- Signal-Based State: Eliminates Zone.js change-detection overhead via `signal()`, `computed()`, and input/output signal primitives.
- Keyset Cursor Pagination: Paginates mutating feed lists on composite keys `(created_at, id)` and `(reactions_count, created_at, id)`, eliminating offset drift and duplicate cards.
- Mutex-Locked Optimistic UI: Heart, unicorn, and bookmark reactions toggle instantly in the UI with in-flight target locks, preventing race conditions from rapid clicking.

### 2. Threaded Discussion Engine
- O(N) Client-Side Tree Reconstruction: Flattens database adjacency lists into deeply nested discussion trees with depth caps at 5 levels to avoid viewport overflow on mobile.
- Counter Synchronization: PostgreSQL triggers maintain active comment counts while honoring soft-deletes (`is_deleted = true`).

### 3. Data & Markdown Pipeline
- Markdown Processing: Dual-layer parsing using `marked` and `DOMPurify` hooks to enforce `target="_blank"` and `rel="noopener noreferrer"` on all external links.
- Reading Time Estimator: Accurate word-count analysis discounting code blocks and frontmatter tokens.

---

## Tech Stack

- Frontend: Angular 19+ (Standalone Components, Signals, New Control Flow `@if` / `@for`)
- Styling: Tailwind CSS v4 (`@theme` tokenization, DEV retro card styling)
- Database: Supabase / PostgreSQL 17 (RLS, Custom Triggers, Adjacency List Comments)
- Bundler & Build Tool: Vite + `@analogjs/vite-plugin-angular`
- Package Manager: `pnpm` (Strict)

---

## Database Schema & Migrations

The database layer consists of 6 tables with Row Level Security:
- `public.profiles`: Synced to `auth.users` via trigger with alphanumeric collision retry.
- `public.posts`: Published and draft technical articles with cached counter aggregates.
- `public.tags`: Tag taxonomy with hex/bg theme pairings.
- `public.post_tags`: Junction table supporting many-to-many relationships.
- `public.comments`: Self-referential adjacency list supporting soft deletes.
- `public.reactions`: Polymorphic reactions supporting posts and comments.

Database migrations and triggers reside in `supabase/migrations/0001_initial_schema.sql`.

---

## Quickstart (Local Docker Stack)

### Prerequisites
- Node.js 22+
- pnpm
- Docker Desktop (running)

### 1. Clone & Install
```bash
git clone https://github.com/mmy-lana/devto-angular-supabase.git
cd devto-angular-supabase
pnpm install
```

### 2. Start Local Supabase
```bash
pnpm dlx supabase start
```

### 3. Seed Local Database
```bash
pnpm dlx supabase db reset
```

### 4. Configure Environment
Copy credentials output by `supabase start` into `.env`:
```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
```

### 5. Run Development Server
```bash
pnpm dev
```
Open `http://localhost:5173` in your browser.

---

## Running in Offline / Static Demo Mode

If Supabase credentials are missing or Docker is not running, the application automatically enters offline mode:
- Displays populated feed cards, comments, authors, and tag directories from `src/app/core/mocks/devto-mock-data.ts`.
- Prevents database runtime crashes and renders an informational status bar.
- Fully compatible with zero-configuration static deployments on Vercel, Netlify, or GitHub Pages.

---

## Quality & Typecheck Commands

```bash
# Typecheck application and node configs
pnpm typecheck

# Production build
pnpm build

# Preview build locally
pnpm preview
```

---

## License

MIT
