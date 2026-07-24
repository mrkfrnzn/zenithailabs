# CFP War Chest 2026 — Continuation Brief
*Last updated: 2026-07-24 (v2 — deployment session) · Author: Mark Franzen + Claude*
*Reason for handoff: app is deployed to Vercel and loading; database setup + admin bootstrap are the remaining blockers, and the agent sandbox cannot perform them. Documenting so a fresh session can finish the go-live.*

---

## Read This First

1. **The app is LIVE on Vercel: https://zenithailabs.vercel.app** — the login page loads correctly on the user's iPad (verified by screenshot). Build succeeded, environment variables are wired.
2. **Two blockers remain before the user can log in and test:** (a) the Supabase **migrations 001–003 have NOT been run** yet, and (b) the **first admin has NOT been bootstrapped**. Until both are done, the DB tables don't exist and there's no account to log in with.
3. **CRITICAL — the agent CANNOT reach Supabase or Vercel from this sandbox.** The agent proxy returns a hard **403 policy denial** for `supabase.co` and `vercel.app` (confirmed via `$HTTPS_PROXY/__agentproxy/status`), and no Supabase MCP connector is attached. So the agent **cannot run the migrations or fire the bootstrap POST itself.** These must be done by the user, OR by enabling the Supabase connector (whose tools run server-side, bypassing the sandbox block). Do not promise to "just do it" from the container — you can't.
4. **Never ask the user to paste secret keys into chat.** The real Supabase publishable/secret keys live only in the user's Vercel env vars and the local gitignored `.env.local`. They are NOT in the repo or chat.
5. **This is NOT standard Next.js** — `AGENTS.md` warns the local Next.js (16.2.6) has breaking changes; consult `node_modules/next/dist/docs/` before writing framework code.

## Context — What This Is

CFP War Chest is a private, season-long college-football futures draft game (3–6 players, commissioner-run). Stack: **Next.js 16.2.6 (App Router, Turbopack)** on **Vercel**; **Supabase** (Postgres + magic-link Auth + Realtime); **Resend** email; Tailwind + Radix. The 2026 season update (new categories + configurable scoring + admin config page) was built and merged earlier. This session focused on **deploying the app to a working Vercel URL the user can open and test on an iPad tonight.**

## What We Accomplished This Session

- **Deployed to Vercel.** Imported `mrkfrnzn/zenithailabs` (production branch `main`) into a Hobby-plan Vercel project named **`zenithailabs`**. First deploy was canceled; a clean redeploy after env vars succeeded → **Ready**. Live at **https://zenithailabs.vercel.app**; login page confirmed loading on iPad.
- **Set all 6 environment variables in Vercel** (Production/Preview/Development): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the `sb_publishable_…` key), `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_…` key), `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL=https://zenithailabs.vercel.app`, `BOOTSTRAP_ADMIN_EMAIL`.
- **Created `.env.example`** (placeholders only) + `.gitignore` `!.env.example` exception; and **generated `docs/`** (7 developer docs). Both shipped via **PR #4 (merged)**.
- **Created `scripts/setup-database.sql`** — migrations 001+002+003 concatenated into ONE file so the user can paste it once into the Supabase SQL Editor (iPad has no CLI). On branch `claude/cfb-futures-mvp-ju2Cw`, commit `4236e90`. Copy link: `github.com/mrkfrnzn/zenithailabs/blob/claude/cfb-futures-mvp-ju2Cw/scripts/setup-database.sql`.
- **Verified deployment readiness** (earlier workflow audit): no build blockers; secrets confirmed NOT committed (triple-verified); env vars enumerated; migration order documented.

## Decisions Locked (do not relitigate)

- **Supabase project:** ref `wxajnfxwqwlinxohrtbc`, URL `https://wxajnfxwqwlinxohrtbc.supabase.co`. Uses the **new Supabase key format** (`sb_publishable_…` = anon, `sb_secret_…` = service_role). (User provided these.)
- **Vercel project = `zenithailabs`, production branch = `main`, URL = `https://zenithailabs.vercel.app`.** All 6 env vars are set there. (Done this session.)
- **Migrations are run by the user via the Supabase SQL Editor** (or via the connector), not by the agent — the sandbox is network-blocked. (Established this session.)
- **Do not modify application code** unless a confirmed deploy/test blocker requires it. (User instruction, repeated.)
- **PRs #3 (2026 categories) and #4 (docs + .env.example) are MERGED to `main`.** Do not reopen.

## Open Items / What's Next

**Immediate (the go-live path, in order):**
1. **User runs the migrations** — open the `scripts/setup-database.sql` GitHub file → **Copy raw file** → Supabase Dashboard → SQL Editor → New query → paste → **Run**. Expect "Success. No rows returned." (Agent cannot do this.) If the seed block (002) errors on an `auth.users` insert, the required parts (001 schema + 003 constraints/column) are what matter — 002 is only sample data.
2. **Bootstrap the first admin** — needs a POST to `https://zenithailabs.vercel.app/api/auth/bootstrap` (reads `BOOTSTRAP_ADMIN_EMAIL`, creates the admin, returns 409 if one already exists). The agent CANNOT send this (proxy-blocked). **Bootstrap options were presented but the user interrupted before choosing — this is OPEN:**
   - (a) iPad **Shortcuts app** → "Get Contents of URL", Method POST, that URL. No code change.
   - (b) A **temporary GET-triggerable bootstrap** (small reversible code change + redeploy) so it's a one-tap Safari link; revert after. Needs user OK (touches code).
   - (c) **Enable the Supabase connector**, then the agent creates the admin rows directly via SQL (replicating `src/app/api/auth/bootstrap/route.ts`), bypassing the blocked HTTP endpoint.
3. **Configure Supabase Auth URLs (likely required for login to work).** Supabase → Authentication → URL Configuration → set **Site URL** and **Redirect URLs** to include `https://zenithailabs.vercel.app` and `https://zenithailabs.vercel.app/auth/callback`. The repo's `supabase/config.toml` defaults `site_url` to `127.0.0.1:3000`, so without this the magic-link email will redirect to localhost and login will fail on the iPad. **Flag this proactively — it's an easy-to-miss blocker.**
4. **Smoke test (user's requested checklist, not yet delivered):** login (magic link) → `/admin` loads → create/import a league → draft room → standings → results. Note the sample data (2025 archive + 2026 sample leagues) only exists if migration 002 ran.

**Near-term:**
- If the user wants the agent to handle Supabase directly going forward, **enabling the Supabase connector** is the path (its tools run server-side, not through the blocked sandbox).
- `scripts/setup-database.sql` sits on branch `claude/cfb-futures-mvp-ju2Cw` (1 commit ahead of `main`); no PR opened for it. Open one only if the user wants it on `main`.

**Strategic (unchanged, deferred):** commissioner UI to toggle categories per league; the missing admin `results`/`standings-review` pages (documented in `docs/TECH_DEBT.md` — the season-scoring UI is unreachable without them); Sentry not wired; TDD-deferred versioned-snapshot architecture.

## Artifacts & Where They Live

| Artifact | What it is | Location | Status |
|---|---|---|---|
| **Live app** | Deployed CFP War Chest | https://zenithailabs.vercel.app | Ready; login loads; DB not yet migrated |
| Vercel project | `zenithailabs`, Hobby, branch `main`, 6 env vars set | vercel.com dashboard | current |
| `scripts/setup-database.sql` | One-paste 001+002+003 for SQL Editor | branch `claude/cfb-futures-mvp-ju2Cw`, commit `4236e90` | current, **not yet run against the DB** |
| `supabase/migrations/00{1,2,3}_*.sql` | The three real migrations | repo `main` | source of truth |
| `docs/` (7 files) | Developer documentation | repo `main` (via PR #4) | current |
| `.env.example` | Env var template (placeholders) | repo `main` | current |
| `.env.local` | Real Supabase URL + publishable + secret keys | local working tree only, **gitignored & untracked** | secret — never commit |
| `CFP_War_Chest_2026_Continuation_Brief.md` | This brief | repo (this file) | current |

## Principles & Gotchas to Carry Forward

- **Sandbox network policy blocks `supabase.co` and `vercel.app` (403 CONNECT denial).** Verify with `curl -sS "$HTTPS_PROXY/__agentproxy/status"`. Do not retry policy denials; do not claim you can run migrations/bootstrap from the container. GitHub, npm, and Anthropic hosts ARE reachable.
- **Two different email systems** — don't conflate: the app's `RESEND_API_KEY` sends the app's *own* emails (invites, on-clock, standings). The **magic-link login email** is sent by **Supabase Auth's** own email provider (Supabase Dashboard → Authentication → Email/SMTP), which is separate and may be rate-limited on the default sender. If login emails don't arrive, check Supabase Auth email config, not Resend.
- **Supabase Auth Site URL / Redirect URLs must point to the Vercel domain** (see Open Item 3) or magic-link login redirects to localhost.
- **Vercel `NEXT_PUBLIC_*` vars are build-time-inlined** — they must be set *before* a deploy. They already are; any change to them requires a redeploy to take effect.
- **`next build` does NOT fail on the 7 ESLint errors** in this repo (verified). Lint-failing ≠ build-failing; the Vercel deploy is unaffected. (`docs/TECH_DEBT.md` item 2 was corrected to say this.)
- **The app boots without env vars but 500s on every route** (middleware constructs a Supabase client). This is why the first no-env deploy showed errors; it's expected, not a bug.
- **Commit trailers** required by session config: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + a `Claude-Session:` line. Do NOT put the model id in commits/PRs/code. **Merged-PR rule:** PRs #3/#4 are merged, so restart the branch from `origin/main` before adding new commits (already done for `scripts/`).
- **GitHub access is via `mcp__github__*` tools only** (no `gh` CLI), scoped to `mrkfrnzn/zenithailabs`. Default branch `main`.

## Stakeholders / Glossary

- **Mark Franzen** — the user; commissioner; email `mark@zenithailabs.com` (the likely `BOOTSTRAP_ADMIN_EMAIL`). Working from an **iPad** (Safari, no terminal) — all steps must be web-only.
- **Bootstrap** — one-time creation of the first admin via `POST /api/auth/bootstrap`; only works while no admin exists.
- **P4 + Notre Dame** — Disaster Draft eligibility pool. **Shoot the moon** — Disaster Draft's +200 winless bonus.

---
*Start fresh — this brief is ground truth. The single most important next action is: the user runs `scripts/setup-database.sql` in the Supabase SQL Editor, then bootstraps the admin, then sets the Supabase Auth Site/Redirect URLs. The agent cannot do the Supabase/Vercel network steps itself.*
