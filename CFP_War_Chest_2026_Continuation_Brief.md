# CFP War Chest 2026 — Continuation Brief
*Last updated: 2026-07-20 · Author: Mark Franzen + Claude*
*Reason for handoff: 2026-category workstream complete and pushed; PR open and being watched. Documenting so a fresh session can pick up review follow-through or the next feature.*

---

## Read This First

1. **The 2026 update is committed, pushed, and in an open PR (#3).** Work lives on branch `claude/cfb-futures-mvp-ju2Cw` in repo `mrkfrnzn/zenithailabs`. PR: https://github.com/mrkfrnzn/zenithailabs/pull/3 (base `main`).
2. **Category names corrected mid-session.** Mike Wade's original chat screenshot called them "Greatest Improvement" and "Hearts/Dumpster Fire." The official uploaded docs renamed them to **Most Improved** (key `most_improved`) and **Disaster Draft** (key `disaster_draft`). The scoring formulas also differ from the first informal guess — use the doc formulas below, not the screenshot's.
3. **Migration 003 must be applied to Supabase (`supabase db push`) before the new categories can be drafted** — it widens category CHECK constraints and adds a column. Until it runs, inserts with `most_improved`/`disaster_draft` are rejected by Postgres.
4. **This app is NOT a normal Next.js.** `AGENTS.md` warns the local Next.js has breaking API changes; consult `node_modules/next/dist/docs/` before writing framework code. (Build runs on Next.js 16.2.6 / Turbopack.)

## Context — What This Is

CFP War Chest is a private, season-long college-football futures draft game for a small friend group (3–6 players, commissioner-run). Players draft athletes/teams before Week 1 and earn points as outcomes resolve (Heisman, CFP, conference titles, etc.). The app is a Next.js App Router + Supabase (Postgres/Auth/Realtime) + Resend build, deployed on Vercel. An MVP with four scoring categories already existed; this session implemented the **2026 season update** defined by three uploaded documents (PRD, GDD, TDD): reduce category overlap, add two counter-cyclical categories, and make scoring commissioner-configurable rather than hard-coded.

## What We Accomplished This Session

**Design docs reconciled.** Read the three uploaded Word docs (PRD/GDD/TDD) and built a styled 3-tab HTML artifact rendering all three (published as a claude.ai artifact; source file at `/tmp/claude-0/.../scratchpad/design-docs.html`).

**Two new scoring categories implemented end-to-end** (commit `1019ede`):
- **Most Improved** (`most_improved`) — formula `wins_over_baseline`: `clamp((regular_season_wins − preseason_win_total) × 25, floor 0, cap 250)`. Regular season only. Any FBS school eligible.
- **Disaster Draft** (`disaster_draft`) — formula `inverted_record`: `clamp(losses × 20 + wins × −20 + winless_bonus, floor 0, uncapped)`. Winless season pays a +200 "shoot the moon" bonus. Pool restricted to P4 + Notre Dame (enforced at import).

**Season-configurable categories.** New leagues from season_year ≥ 2026 default to Heisman, CFP Run, Cinderella, Most Improved, Disaster Draft — **Conference Champion disabled** (kept for the 2025 archive). Earlier seasons keep the legacy four. Category lists across UI are now derived from the league's `settings_json.draft_segment_order`, not hard-coded.

**Admin scoring configuration page** (the user's explicit ask): new `/admin/leagues/[id]/draft-setup` page + `ScoringEditor.tsx` client component, backed by new `PATCH /api/admin/leagues/[id]/scoring` route. Lets the commissioner edit multipliers, point values, bonuses, caps, floors, and picks-per-player per category. Audit-logged; locks once the draft starts; never overwrites a locked config.

**Supporting changes:** engine formulas + defaults, standings builder (added generic `category_points` map + named fields), import parser (required columns, P4 eligibility, win-total validation + aliases), import/results routes (store `preseason_win_total`, thread wins/losses/baseline into scoring), utils labels/colors (CFP → "CFP Run"; orange/red for new cats), Badge `orange` variant, migration `003_add_new_categories.sql`, 4 sample CSVs, README updates.

**Two pre-existing build blockers fixed** (discovered during `next build` verification, unrelated to the feature): `email.ts` eagerly constructed the Resend client at import (now lazy); `/login` used `useSearchParams()` without a Suspense boundary (now wrapped).

**Verification:** `tsc --noEmit` clean; **54 unit tests pass** (was 39; +15 new for both formulas and import validation); `next build` green. My authored files are lint-clean.

**Shipped:** committed as `1019ede`, pushed, opened PR #3, subscribed to PR activity for autofix/review-response.

## Decisions Locked (do not relitigate)

- **Category keys are `most_improved` and `disaster_draft`.** CFP keeps its existing key `cfp` (display label changed to "CFP Run") to preserve 2025 archive reproducibility. (From the uploaded PRD/GDD, which are the source of truth.)
- **Scoring formulas & defaults** as specified above (Most Improved 25 pts/win, floor 0, cap 250; Disaster Draft +20/loss, −20/win, +200 winless, floor 0, uncapped). These come straight from GDD §6.4–6.5.
- **Conference Champion is disabled for 2026, retained for 2025** — implemented at league-creation time (not seeded for 2026 leagues). Not deleted.
- **Commissioner wants an admin page to edit points/scoring** — built as `/admin/leagues/[id]/draft-setup`. (User confirmed: "Yes, I do want to have an admin configuration page where I can edit the points and scoring.")
- **Open a PR and watch it** — done (PR #3, subscribed).

## Open Items / What's Next

**Immediate**
- **Apply migration 003** to the Supabase project (`supabase db push`) before anyone drafts the new categories. Not yet run against any live DB in this session.
- **Watch PR #3.** Currently: no CI configured in the repo (0 GitHub Actions workflows), no review comments. Subscription is active and will wake a session on review comments/reviews. Webhooks do NOT deliver new pushes, CI-success, or merge-conflict transitions.

**Near-term**
- **Merge-conflict risk:** PRs #1 and #2 (unrelated apps — an NFL survivor league and a *different* Prisma/SQLite CFB implementation) are also open against `main`. If either merges first, PR #3 may develop silent conflicts (webhook won't announce it). If so, rebase `claude/cfb-futures-mvp-ju2Cw` onto latest `main`.
- Note: `main` does not yet contain this branch's earlier MVP commit (`6d775f9`), so PR #3's diff spans the full Supabase-based build + the 2026 update.

**Strategic (proposed, NOT decided)**
- **Commissioner UI toggle to enable/disable categories per league.** Floated as a follow-up; user has not committed. Currently category on/off is decided at league creation by season year. Would require mutating `draft_segment_order` + `pick_counts` + `scoring_configs` + `draft_segments` rows together.
- Other known MVP gaps carried from before this session (not touched here): missing admin `results` upload UI and `standings-review` pages, broken invite form pattern in `/admin/leagues/[id]/page.tsx` (server action calling internal API), draft-timer background job, Sentry not initialized. These predate the 2026 work; confirm scope with the user before acting.
- TDD describes heavier architecture (immutable baseline snapshots, `ScoreCalculationRun`, `TeamGameResult` game-classification enum) that was intentionally NOT built — the pragmatic mapping onto the existing `scoring_configs` JSON + CSV-import model was chosen per the TDD's own "smallest compatible plan" instruction. Revisit only if the group wants full versioned recalculation history.

## Artifacts & Where They Live

| Artifact | What it is | Location | Status |
|---|---|---|---|
| Commit `1019ede` | The entire 2026 update | branch `claude/cfb-futures-mvp-ju2Cw` (pushed) | current |
| PR #3 | Open pull request, base `main` | https://github.com/mrkfrnzn/zenithailabs/pull/3 | open, watched |
| `supabase/migrations/003_add_new_categories.sql` | Constraint widening + `preseason_win_total` column + 2026 sample-league refresh | repo | current, **not yet applied to live DB** |
| `src/lib/scoring/engine.ts` | New `wins_over_baseline` + `inverted_record` formulas, defaults | repo | current |
| `src/app/admin/leagues/[leagueId]/draft-setup/page.tsx` + `ScoringEditor.tsx` | Admin scoring config page | repo | current |
| `src/app/api/admin/leagues/[leagueId]/scoring/route.ts` | PATCH scoring/pick-count route | repo | current |
| `samples/sample_{preseason_,}{most_improved,disaster_draft}*.csv` | 4 sample import/results CSVs | `samples/` | current |
| Design-docs artifact | 3-tab PRD/GDD/TDD HTML | claude.ai artifact + `/tmp/claude-0/-home-user-zenithailabs/47c0ea0e-.../scratchpad/design-docs.html` | current (scratchpad is ephemeral) |
| Source docs | Uploaded PRD/GDD/TDD `.docx` | `/root/.claude/uploads/47c0ea0e-.../` (PRD `50601295-`, GDD `61c24fe8-`, TDD `9b2420d6-`) | reference |

## Principles & Gotchas to Carry Forward

- **`Category` union lives in `src/types/database.ts`.** It's referenced in ~15 files. When adding a category: extend the union, then `DEFAULT_SCORING_CONFIGS` (typed `Record<Category, …>` — must be exhaustive), engine formula dispatch, `standings.ts` (`NAMED_FIELD` map + `category_points`), `parser.ts` `REQUIRED_COLUMNS` (also exhaustive), the import/results routes' `validCategories`, `utils.ts` label+color, Badge variant if a new color, and migration CHECK constraints on 5 tables (`draft_segments`, `draft_picks`, `scoring_configs`, `scores`, `result_imports`).
- **`LeagueSettings.pick_counts` is now `Partial<Record<Category, number>>`** — a season only carries counts for its enabled categories. Index with `?? fallback`.
- **Scoring is config-driven.** Formulas read `scoring_configs.config_json` (JSONB); the engine dispatches on `config.formula`. Record-based formulas (`wins_over_baseline`, `inverted_record`) are handled before the "no outcome ⇒ 0" guard because they score from wins/losses, not an outcome-bucket string.
- **Results import path:** the raw result row is stored in `result_rows.raw_row_json`; at publish time the results route reads wins/losses from there and the baseline from `draftable_entities.preseason_win_total`. Column aliases for win total: `win_total`, `over_under`, `ou_line`, `vegas_win_total`, `preseason_wins`.
- **Verification commands:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`. `npm install` is required first (deps were not pre-installed). `next build` will fail without `RESEND_API_KEY` unless the Resend client stays lazy — keep it lazy.
- **Pre-existing lint errors exist** in files NOT authored this session (`draft/page.tsx`, `leagues/[leagueId]/page.tsx`, `leagues/page.tsx` — unescaped apostrophes, unused vars). `next build` still passes. Don't expand scope to fix them unless asked.
- **GitHub access is via `mcp__github__*` MCP tools only** (no `gh` CLI), scoped to `mrkfrnzn/zenithailabs`. Default branch is `main`.
- **Commit trailers required** by session config: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + a `Claude-Session:` line; PR bodies end with the Claude Code generated-with line. Do NOT put the model id in commits/PRs/code — chat only.

## Stakeholders / Glossary

- **Mark Franzen** — the user; commissioner; email mark@zenithailabs.com.
- **Mike Wade** — league member who proposed the two new categories.
- **Darren Steadman** — provided 2025 scoring notes (referenced in docs).
- **P4** — Power 4 conferences: SEC, Big Ten, Big 12, ACC. Disaster Draft eligibility = P4 + Notre Dame.
- **Baseline** (Most Improved) — the locked preseason regular-season win total (Vegas over/under line), e.g. 5.5.
- **Shoot the moon** — Disaster Draft's +200 winless bonus (Hearts card-game analogy).

---
*Start fresh — this brief is ground truth. Don't try to reconstruct the prior thread; work from here.*
