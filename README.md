# CFB War Chest 2026

College Football Futures Showdown — Web Application MVP

A private, friends-and-family fantasy game played alongside the 2026 College Football season. Players draft a "War Chest" of athletes and schools before Week 1, then earn points through the regular season, conference championships, the Heisman Trophy, and the College Football Playoff.

## Stack

| Concern | Choice |
|---|---|
| Frontend | Next.js 14+ (App Router, TypeScript) |
| Hosting | Vercel |
| Database / Auth / Realtime | Supabase (Postgres + Auth + Realtime) |
| Email | Resend |
| UI | Tailwind CSS + Radix UI primitives |
| Schema validation | Zod |
| File parsing | papaparse (CSV) + SheetJS (XLSX) — server-side only |
| Testing | Vitest (unit) + Playwright (E2E) |
| Error monitoring | Sentry |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
# Fill in your Supabase, Resend, and Sentry credentials
```

### 3. Database migrations

With the Supabase CLI installed:

```bash
supabase db push
# or for local dev:
supabase start && supabase db reset
```

This runs `supabase/migrations/001_initial_schema.sql` (schema + RLS policies),
`supabase/migrations/002_seed_data.sql` (2025 archive + 2026 sample league), and
`supabase/migrations/003_add_new_categories.sql` (Most Improved + Disaster Draft
categories, widened constraints, and the `preseason_win_total` column).

### 4. Bootstrap admin

After deploying, create the first admin account:

```bash
curl -X POST https://your-app.vercel.app/api/auth/bootstrap
```

This uses `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_NAME` from your env. Only works when no admin exists yet.

### 5. Run locally

```bash
npm run dev
# App runs at http://localhost:3000
```

### 6. Run tests

```bash
npm test               # Vitest unit tests (39 tests)
npm run test:e2e       # Playwright E2E (requires running app)
```

## Project Structure

```
src/
  app/
    login/        Magic-link login page
    auth/         Auth callback handler
    admin/        Admin dashboard + league management pages
    leagues/      Player-facing league views, draft room, standings
    api/          API routes (admin + player)
  lib/
    supabase/     Browser + server Supabase clients, middleware
    scoring/      Scoring engine + standings builder
    draft/        Snake draft order generator
    import/       CSV/XLSX parser + fuzzy name matching
    auth.ts       Session helpers (requireAdmin, requireLeagueMember)
    audit.ts      Audit log writer
    email.ts      Resend email helpers
  types/          Canonical database types
  __tests__/      Vitest unit tests
e2e/              Playwright E2E tests
supabase/
  migrations/     001_initial_schema.sql, 002_seed_data.sql
  config.toml     Local dev config
samples/          Sample import CSVs (clean + malformed)
```

## Scoring Engine

All formulas are config-driven (stored in `scoring_configs` table, locked at draft start).

| Category | Formula |
|---|---|
| Heisman | `multiplier × (pick_odds / lowest_drafted_odds_in_category)` |
| CFP Run | `multiplier × (pick_odds / lowest_drafted_odds_in_category)` |
| Cinderella | Fixed points by final regular-season AP rank bucket |
| Conference Champion | `multiplier × (pick_odds / lowest_drafted_odds_in_same_conference)` *(2026: disabled by default, retained for 2025 archive)* |
| Most Improved | `clamp((regular_season_wins − preseason_win_total) × points_per_win, floor, cap)` — default 25 pts/win, floor 0, cap 250 |
| Disaster Draft | `clamp(losses × 20 + wins × −20 + winless_bonus, floor, cap)` — losses help, wins hurt, winless pays +200 |

From 2026, new leagues default to **Heisman, CFP Run, Cinderella, Most Improved, Disaster Draft** (Conference Champion disabled). Point values, multipliers, bonuses, caps, floors, and picks-per-player are editable per category at `/admin/leagues/:id/draft-setup` until the draft locks.

See `src/lib/scoring/engine.ts`. Idempotent — re-running against same inputs produces identical results.

## Draft System

- Snake order: odd rounds go 1→N, even rounds go N→1
- Per-category exclusivity: a school drafted in CFP can still be drafted in Conference Champion
- Realtime via Supabase Postgres CDC channels (< 2 second pick propagation)
- Admin controls: start, pause, resume, undo, skip, override (all audit-logged with reason)
- On-clock emails via Resend when it's a player's turn; 30-second warning email if timer enabled

## Page Routes

| Path | Description |
|---|---|
| `/` | Redirects to `/leagues` or `/login` |
| `/login` | Magic-link request form |
| `/leagues` | Player's league list |
| `/leagues/:id` | League home (on-clock banner, navigation) |
| `/leagues/:id/draft` | Live draft room (realtime) |
| `/leagues/:id/war-chest` | Own War Chest with scoring breakdown |
| `/leagues/:id/draft-board` | Full draft board by round |
| `/leagues/:id/standings` | Standings with milestone progress |
| `/leagues/:id/trash-talk` | Realtime message board |
| `/admin` | Admin dashboard |
| `/admin/leagues/new` | Create league |
| `/admin/leagues/:id` | League overview + invite players |
| `/admin/leagues/:id/import` | Preseason data import |
| `/admin/leagues/:id/draft-setup` | Categories, pick counts, scoring config |
| `/admin/leagues/:id/draft-control` | Live draft controls |
| `/admin/leagues/:id/results` | Upload results + publish scoring |
| `/admin/leagues/:id/audit` | Audit log |

## Seed Data

Two leagues ship with the app:

- **War Chest 2025 (Archive)** — read-only, real 2025 picks/scores  
  (Darren Steadman 5,300 / Mike Wade 3,986.4 / Michael Steadman 2,200 / Mark Franzen 2,009.1)
- **War Chest 2026 (Sample)** — status=setup, 6 fictional players for testing import and draft flows

## Deployment

1. Push to GitHub, connect to Vercel
2. Set all env vars from `.env.example` in Vercel project settings  
   Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, `SENTRY_DSN`
3. Run `supabase db push` against your production Supabase project
4. Call `/api/auth/bootstrap` once to create the admin account
5. Log in at `/login` → admin goes to `/admin`, players go to `/leagues`
