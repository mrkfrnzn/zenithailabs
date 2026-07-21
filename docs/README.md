# CFP War Chest — Developer Documentation

CFP War Chest is a private, season-long **college-football futures draft game** (3–6 players,
commissioner-run) played alongside the college football season. Players draft a "War Chest" of
athletes and schools before Week 1, then earn points through the regular season, conference
championships, the Heisman, and the College Football Playoff. Scoring is fully config-driven and
the draft is a realtime snake draft.

This folder is the developer documentation set. Start here, then jump to the deep-dive docs below.

---

## Documentation index

| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System layering (presentation → services → domain → persistence), request lifecycle, auth model, RLS strategy, scoring engine, snake draft + Realtime, import/fuzzy matching, audit logging. |
| [ROUTES.md](./ROUTES.md) | Complete map of every page (`src/app/**/page.tsx`) and API route (`src/app/api/**/route.ts`) with auth level for each. |
| [API.md](./API.md) | HTTP API reference — request/response shapes, validation, status codes, and quirks for every route handler. |
| [DATABASE.md](./DATABASE.md) | Postgres schema reference reconstructed from the migrations — tables, indexes, RLS policies, triggers, Realtime publication, scoring-config JSON shapes, ER diagram. |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Vercel + Supabase deployment checklist, environment variables (client-exposed vs server-only), and migration/bootstrap steps. |
| [TECH_DEBT.md](./TECH_DEBT.md) | Prioritized known gaps and technical debt (missing admin pages, lint blockers, unwired Sentry/timer email, deprecated middleware convention). |

The root [`README.md`](../README.md) has a product-level overview, scoring formulas, and seed-data notes.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) on Vercel |
| Database / Auth / Realtime | Supabase — Postgres, magic-link Auth, Realtime CDC |
| Email | Resend |
| UI | Tailwind CSS + Radix UI |
| Validation | Zod |
| Import parsing | papaparse (CSV) + SheetJS/`xlsx` (XLSX), server-side only |
| Fuzzy name matching | fuse.js |
| Testing | Vitest (unit) + Playwright (E2E) |

> Note: the root README lists "Next.js 14+"; the codebase is on Next.js 16.2.6. Follow the version-specific
> guides under `node_modules/next/dist/docs/` before writing framework code — several conventions differ.

---

## Run it locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create `.env.local`** (copy `.env.example` as a starting point) and fill in the Supabase, Resend,
   and bootstrap vars. Minimum to boot and authenticate:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # anon/publishable key
   SUPABASE_SERVICE_ROLE_KEY=...            # secret, server-only, bypasses RLS
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   RESEND_API_KEY=...                       # required for outbound email
   BOOTSTRAP_ADMIN_EMAIL=you@example.com    # first admin created by bootstrap
   BOOTSTRAP_ADMIN_NAME=Commissioner        # optional
   ```
   See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full variable table and which are client-exposed.

3. **Apply the database schema** (Supabase CLI installed and project linked/running):
   ```bash
   supabase db push           # or: npm run db:migrate
   ```
   This runs `001_initial_schema.sql` (schema + RLS + Realtime), `002_seed_data.sql`
   (2025 archive + 2026 sample league), and `003_add_new_categories.sql`
   (Most Improved + Disaster Draft, `preseason_win_total`, widened CHECK constraints).

4. **Start the dev server**
   ```bash
   npm run dev                # http://localhost:3000
   ```

5. **Bootstrap the first admin** (one-time; refuses once any admin exists):
   ```bash
   curl -X POST http://localhost:3000/api/auth/bootstrap
   ```
   Uses `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_NAME`. Then sign in at `/login` — admins land on
   `/admin`, players on `/leagues`.

---

## Repository structure

```
src/
  app/
    login/        Magic-link login page
    auth/         Auth callback handler (GET /auth/callback)
    admin/        Admin dashboard + league management pages
    leagues/      Player-facing league views, draft room, standings
    api/          API route handlers (admin + player)
  lib/
    supabase/     Browser + server Supabase clients, session middleware
    scoring/      Config-driven scoring engine + standings builder
    draft/        Snake draft order generator
    import/       CSV/XLSX parser + fuzzy name matching
    auth.ts       Session/role guards (requireAdmin, requireLeagueMember, …)
    audit.ts      Audit log writer
    email.ts      Resend email helpers
  types/          Canonical database types + Category union (database.ts)
  __tests__/      Vitest unit tests
  middleware.ts   Session refresh + private-route gate
e2e/              Playwright E2E tests
supabase/
  migrations/     001 schema+RLS, 002 seed, 003 new categories
  config.toml     Local dev config
samples/          Sample import CSVs (clean + malformed)
docs/             This documentation set
```

The domain layer (`src/lib/**`) is pure and framework-free: route handlers fetch rows, call domain
functions, and persist results. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the dependency rules.

---

## Testing

```bash
npm test           # Vitest unit tests (vitest run) — scoring, standings, snake order, import parsing
npm run test:watch # Vitest in watch mode
npm run test:e2e   # Playwright E2E (playwright test) — requires the app running
```

Unit tests live in `src/__tests__/`; end-to-end specs in `e2e/`.

---

## Where to go next

- Understanding the system → [ARCHITECTURE.md](./ARCHITECTURE.md)
- Finding a page or endpoint → [ROUTES.md](./ROUTES.md) then [API.md](./API.md)
- Schema, RLS, or a migration question → [DATABASE.md](./DATABASE.md)
- Shipping to production → [DEPLOYMENT.md](./DEPLOYMENT.md)
- Known gaps before you build → [TECH_DEBT.md](./TECH_DEBT.md)
