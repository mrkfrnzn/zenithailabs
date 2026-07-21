# Deployment — Vercel + Supabase

Deployment checklist and reference for **CFP War Chest**. The app is a Next.js 16
(App Router, Turbopack) project hosted on **Vercel**, backed by a **Supabase**
project (Postgres + magic-link Auth + Realtime CDC) and **Resend** for email.

Everything below is verified against the actual source (`process.env` usage in
`src/`, `.env.example`, `supabase/migrations/`, `supabase/config.toml`,
`package.json`, and `src/app/api/auth/bootstrap/route.ts`).

> All values shown are **placeholders**. Never commit or paste real keys, tokens,
> or service-role secrets into this file, into git, or into a client bundle.

---

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and locally
in `.env.local`, which is gitignored via the `.env*` rule). Copy `.env.example`
as your starting point.

### Client-exposed (`NEXT_PUBLIC_*`) — bundled into the browser, treat as public

| Variable | Required | Default | Read in | Notes |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | none | `src/lib/supabase/{client,server,middleware}.ts` | e.g. `https://YOUR-PROJECT-REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | none | `src/lib/supabase/{client,server,middleware}.ts` | Anon / publishable key — safe to expose |
| `NEXT_PUBLIC_APP_URL` | Recommended | `http://localhost:3000` | `src/lib/email.ts` | **Set to your production URL on Vercel** or every magic link / email button points at localhost |

### Server-only secrets — never expose to the browser

| Variable | Required | Default | Read in | Notes |
| --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | none | `src/lib/supabase/server.ts` (`createServiceClient`) | **Secret.** Bypasses RLS. Server-only — never a `NEXT_PUBLIC_` var |
| `RESEND_API_KEY` | For email | none | `src/lib/email.ts` | Invite / on-clock / timer-warning / standings emails. Client is lazily built, so the app boots without it, but sends fail at runtime |
| `EMAIL_FROM` | Optional | `CFB War Chest <noreply@cfbwarchest.com>` | `src/lib/email.ts` | From-address; use a domain verified in Resend |
| `BOOTSTRAP_ADMIN_EMAIL` | For bootstrap | none | `src/app/api/auth/bootstrap/route.ts` | Consumed once by `POST /api/auth/bootstrap` to create the first admin |
| `BOOTSTRAP_ADMIN_NAME` | Optional | `Commissioner` | `src/app/api/auth/bootstrap/route.ts` | Display name for the bootstrapped admin |

### Not consumed by the app (do not rely on these)

| Variable | Status |
| --- | --- |
| `SENTRY_DSN` | `@sentry/nextjs` (`^10.53.1`) is installed but **not wired up** — no `process.env.SENTRY_DSN` read exists anywhere in `src/`. Setting it currently has **no effect**. (Note: `README.md` lists it as "required" — that is aspirational; the code does not read it.) |
| `PLAYWRIGHT_BASE_URL` | E2E test tooling only — do **not** set in Vercel |

Minimum set to boot the app: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Add
`RESEND_API_KEY` + `NEXT_PUBLIC_APP_URL` for working email, and
`BOOTSTRAP_ADMIN_EMAIL` to seed the first admin.

---

## 2. Supabase database setup

### 2.1 Migration order

Apply in strict numeric order — later migrations depend on earlier ones:

1. `supabase/migrations/001_initial_schema.sql` — all tables, RLS policies,
   `updated_at` triggers, and the Realtime publication statements (see §2.3).
2. `supabase/migrations/002_seed_data.sql` — 2025 archive league (read-only real
   data) + 2026 sample league (`status=setup`, fictional players).
3. `supabase/migrations/003_add_new_categories.sql` — adds the `most_improved`
   and `disaster_draft` categories, the `preseason_win_total` column, and the
   widened CHECK constraints for 2026.

### 2.2 Applying migrations

**Against a hosted (production) project — Supabase CLI:**

```bash
supabase login                              # once, with a personal access token
supabase link --project-ref YOUR-PROJECT-REF
supabase db push                            # applies 001 → 002 → 003 in order
```

`supabase db push` is also wired as an npm script:

```bash
npm run db:migrate      # = supabase db push
```

**Local development (resets and re-seeds a local stack):**

```bash
supabase start
npm run db:reset        # = supabase db reset — replays all migrations from scratch
```

Postgres major version is pinned to **15** in `supabase/config.toml`.

### 2.3 Enabling Realtime

Realtime is enabled **inside migration 001** — no dashboard clicks required. Lines
444–446 of `001_initial_schema.sql` add the draft-sensitive tables to the default
`supabase_realtime` publication:

```sql
alter publication supabase_realtime add table public.draft_state;
alter publication supabase_realtime add table public.draft_picks;
alter publication supabase_realtime add table public.trash_talk_posts;
```

Applying 001 therefore turns on CDC for live pick propagation and trash talk.
`config.toml` also has `[realtime] enabled = true` for the local stack. If you
ever recreate the publication manually, re-run these three statements.

---

## 3. Bootstrap the first admin

There is no admin until you seed one. After the app is deployed and migrations
are applied, call the bootstrap route **once**:

```bash
curl -X POST https://YOUR-APP.vercel.app/api/auth/bootstrap
```

Behavior (`src/app/api/auth/bootstrap/route.ts`):

- Reads `BOOTSTRAP_ADMIN_EMAIL` (required) and `BOOTSTRAP_ADMIN_NAME`
  (defaults to `Commissioner`).
- Returns **400** if `BOOTSTRAP_ADMIN_EMAIL` is unset.
- Returns **409 `Admin already exists`** if any `role = 'admin'` user is present —
  it is safe to call, and idempotent in the sense that it refuses to create a
  second admin.
- On success creates a confirmed Supabase Auth user plus a `public.users` profile
  row with `role = 'admin'`, and returns `{ success: true, email }`.

The admin then signs in via the normal magic-link flow at `/login`.

---

## 4. Vercel deploy checklist

1. **Import the repo** into Vercel (New Project → import from GitHub).
2. **Framework preset:** Next.js (auto-detected). Leave the build command as the
   default `next build`; no custom output settings are needed.
3. **Set environment variables** (§1) for the Production (and Preview) environments —
   at minimum the three boot vars, plus `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`
   (your real production URL), and `BOOTSTRAP_ADMIN_EMAIL`.
4. **Deploy.** Confirm the build succeeds and the app boots.
5. **Apply database migrations** against the production Supabase project
   (§2.2: `supabase link` → `supabase db push`). Confirm Realtime publication
   statements ran (§2.3).
6. **Bootstrap the admin** (§3): `POST /api/auth/bootstrap` once.
7. **Smoke test:**
   - Sign in as the admin via magic link at `/login` (check the email lands —
     validates `RESEND_API_KEY` + `EMAIL_FROM` + `NEXT_PUBLIC_APP_URL`).
   - Open the 2025 archive league and confirm standings render (validates DB +
     seed data from 002).
   - Open the admin scoring-config page
     `/admin/leagues/[leagueId]/draft-setup` and confirm the 2026 categories
     (`most_improved`, `disaster_draft`) appear and `conference_champion` is
     disabled for 2026 (validates 003).
   - Start a draft in the 2026 sample league in one tab and confirm a pick made
     in another tab appears within ~2s (validates Realtime).

---

## 5. Post-deploy notes

- **Auth redirect URLs:** in the Supabase dashboard (Auth → URL Configuration),
  add your production origin to the allowed redirect URLs so magic links resolve.
  Local defaults live in `config.toml` (`site_url`, `additional_redirect_urls`).
- **Email domain:** verify your sending domain in Resend and point `EMAIL_FROM`
  at it; otherwise deliverability suffers.
- **Service-role key hygiene:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Keep it
  server-only, rotate it if it ever leaks, and never prefix it with `NEXT_PUBLIC_`.
