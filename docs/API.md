# CFP War Chest — API Reference

Every HTTP route under `src/app/api/**`. All handlers are Next.js App Router
route handlers (`route.ts`). Request/response fields below are taken directly
from the route source and reflect the real behavior, including quirks.

## Conventions

**Auth helpers** (`src/lib/auth.ts`):

- `getSessionUser()` — resolves the Supabase-Auth session user + `users` profile row, or `null`.
- `requireAuth()` — alias for `getSessionUser()`; any signed-in user.
- `requireAdmin()` — returns the user only if `users.role === 'admin'`, else `null`.
- `requireLeagueMember(leagueId)` — returns the profile only if the caller is a `league_members` row for that league, else `null`.

Failed auth returns `401` with `{ "error": "Unauthorized" }` (except `/api/auth/me`, which returns the literal body `null`).

**Validation** — request bodies are parsed with Zod. A failed `safeParse` returns
`422` with `{ "error": <zod flatten() output> }` unless noted otherwise.

**Supabase** — routes use the service-role client (`createServiceClient()`) for
writes, bypassing RLS; auth helpers use the request-scoped client
(`createClient()`) so RLS + the session cookie apply.

**Audit logs** — `writeAuditLog()` inserts a row into `audit_logs`
(`league_id, actor_user_id, action, entity_type, entity_id, before_json, after_json`).
Only the routes noted below write audit rows.

**Category union** (`src/types/database.ts`): `heisman | cfp | cinderella | conference_champion | most_improved | disaster_draft`.

---

## Auth

### POST `/api/auth/bootstrap`

Create the initial admin account from environment variables. One-time
setup; refuses once any admin exists.

- **Auth:** none (public), but self-guards on the "admin already exists" check.
- **Body:** none. Reads env `BOOTSTRAP_ADMIN_EMAIL` (required) and `BOOTSTRAP_ADMIN_NAME` (optional, defaults to `"Commissioner"`).
- **Side effects:** creates a Supabase Auth user (`email_confirm: true`) and inserts a `users` row with `role: 'admin'`. No email, no audit log.

| Status | Body |
| --- | --- |
| 200 | `{ "success": true, "email": <adminEmail> }` |
| 400 | `{ "error": "BOOTSTRAP_ADMIN_EMAIL not set" }` |
| 409 | `{ "error": "Admin already exists" }` |
| 500 | `{ "error": <auth createUser error / "Failed to create user" / profile insert error> }` |

### POST `/api/auth/invite`

Invite a player to a league and email them a magic-link.

- **Auth:** `requireAdmin` → `401` if not admin.
- **Body (JSON):**
  - `email` (string, email) — required
  - `display_name` (string, 1–50) — required
  - `league_id` (string, uuid) — required
- **Side effects:**
  - Looks up existing Auth user by email; if absent, creates one (`email_confirm: false`).
  - Upserts a `users` profile row with `role: 'player'` (onConflict `id`).
  - Upserts a `league_members` row (`invite_status: 'pending'`, `role_in_league: 'player'`, onConflict `league_id,user_id`).
  - Sends the invite email via Resend (`sendInviteEmail`) — magic link to `/login?redirectTo=/leagues/<league_id>/draft`.
  - No audit log.

| Status | Body |
| --- | --- |
| 200 | `{ "success": true }` |
| 401 | `{ "error": "Unauthorized" }` |
| 422 | `{ "error": <zod flatten> }` |
| 500 | `{ "error": <createUser error / league_members upsert error> }` |

### GET `/api/auth/me`

Return the current session user profile.

- **Auth:** `getSessionUser` (any signed-in user).
- **Body:** none.

| Status | Body |
| --- | --- |
| 200 | `{ "id", "email", "display_name", "role" }` |
| 401 | `null` (literal null body, not an error object) |

---

## Admin — Leagues

### GET `/api/admin/leagues`

List all leagues.

- **Auth:** `requireAdmin` → `401`.
- **Response 200:** array of leagues, each with `league_members(count)`, ordered by `created_at` desc.
- **500:** `{ "error": <db error> }`.

### POST `/api/admin/leagues`

Create a league with season-aware defaults and seed its scoring configs,
draft segments, and draft state.

- **Auth:** `requireAdmin` → `401`.
- **Body (JSON):**
  - `name` (string, 1–100) — required
  - `season_year` (int, 2024–2030) — required
  - `max_players` (int, 3–8, default `6`)
  - `conferences` (string[], min 1) — required
- **Season logic:** for `season_year >= 2026`, `pick_counts = { heisman:3, cfp:4, cinderella:4, most_improved:2, disaster_draft:2 }` and segment order excludes `conference_champion`. Earlier seasons use `{ heisman:4, cfp:4, cinderella:4, conference_champion: 3 * conferences.length }`.
- **Side effects:**
  - Inserts a `leagues` row (`status` defaults to `setup`, `settings_json` = computed defaults, `created_by` = admin).
  - Inserts a `league_members` row for the admin (`role_in_league: 'admin'`, `invite_status: 'accepted'`).
  - Seeds `scoring_configs` (one per enabled category, from `DEFAULT_SCORING_CONFIGS`, `locked: false`).
  - Seeds `draft_segments` (one per category, `status: 'pending'`).
  - Inserts a `draft_state` row (`status: 'not_started'`, `current_overall_pick_number: 1`).
  - No email, no audit log.

| Status | Body |
| --- | --- |
| 201 | the created league row |
| 401 | `{ "error": "Unauthorized" }` |
| 422 | `{ "error": <zod flatten> }` |
| 500 | `{ "error": <league insert error> }` |

---

### GET `/api/admin/leagues/[leagueId]`

Fetch one league with nested relations.

- **Auth:** `requireAdmin` → `401`.
- **Response 200:** the league joined with `league_members(*, users(id,email,display_name))`, `draft_segments(*)`, `scoring_configs(*)`, `draft_state(*)`.
- **404:** `{ "error": <db error message> }` (returned for any select error, including not-found).

### PATCH `/api/admin/leagues/[leagueId]`

Update league name / settings.

- **Auth:** `requireAdmin` → `401`.
- **Body (JSON):**
  - `name` (string, 1–100) — optional
  - `settings_json` (object / record) — optional
- **Status gate:** edits are allowed only when `league.status` ∈ `{setup, data_imported, draft_ready}`, **except** a body whose keys are all within `{trash_talk_enabled, trash_talk_moderation}`, which is always allowed (moderation stays editable mid-draft). Otherwise `409`.
- **Side effects:** updates the league row and bumps `updated_at`. No audit log is written (the handler imports `writeAuditLog` but does not call it), no email.

| Status | Body |
| --- | --- |
| 200 | the updated league row |
| 401 | `{ "error": "Unauthorized" }` |
| 404 | `{ "error": "League not found" }` |
| 409 | `{ "error": "League settings are locked once the draft starts" }` |
| 422 | `{ "error": <zod flatten> }` |
| 500 | `{ "error": <update error> }` |

---

### POST `/api/admin/leagues/[leagueId]/import`

Import a draft-pool CSV/XLSX for one category. Replaces any existing
entities for that category (re-import flow).

- **Auth:** `requireAdmin` → `401`.
- **Content type:** `multipart/form-data`.
  - `file` (File) — `.csv`, `.xlsx`, or `.xls`; max 5 MB
  - `category` (string, one of the Category union)
- **Status gate:** `404` if league missing; `409` if `league.status` ∈ `{drafting, drafted, scoring, completed}` ("Cannot import after draft lock").
- **Processing:** parses rows, normalizes them, runs `validateRows` to produce `flags`. Builds `draftable_entities` (entity_type `athlete` for heisman else `school`; per-category odds column; `preseason_win_total` captured for `most_improved`; `eligible_categories_json` includes the target category). Deletes existing entities matching this category, then inserts the new set.
- **Side effects:** deletes + inserts `draftable_entities`; transitions `league.status` `setup → data_imported` (only from `setup`). No email, no audit log.

| Status | Body |
| --- | --- |
| 200 | `{ "imported": <count>, "flags": <validation flags>, "rows": <normalized rows> }` |
| 400 | `{ "error": "file and category are required" }` / `"Invalid category"` / `"Parse error: …"` |
| 401 | `{ "error": "Unauthorized" }` |
| 404 | `{ "error": "League not found" }` |
| 409 | `{ "error": "Cannot import after draft lock" }` |
| 413 | `{ "error": "File too large (max 5 MB)" }` |
| 415 | `{ "error": "Unsupported file type (CSV or XLSX only)" }` |
| 500 | `{ "error": <insert error> }` |

---

### POST `/api/admin/leagues/[leagueId]/draft`

Admin draft-control endpoint. A single POST with an `action` discriminator.

- **Auth:** `requireAdmin` → `401`.
- **Body (JSON):** discriminated union on `action`:
  - `{ action: "lock_pool" }`
  - `{ action: "set_order", player_ids: uuid[], randomize?: boolean }`
  - `{ action: "start" }`
  - `{ action: "pause" }`
  - `{ action: "resume" }`
  - `{ action: "undo" }`
  - `{ action: "skip", reason: string }`  *(accepted by the schema but not implemented — see note)*
  - `{ action: "override", entity_id: uuid, reason: string }`  *(accepted by the schema but not implemented — see note)*
  - `{ action: "complete" }`
- `422` on schema failure; `404` if league not found.

Per-action behavior and side effects:

| action | Preconditions (else 409) | Effects | Audit action | Success 200 |
| --- | --- | --- | --- | --- |
| `lock_pool` | status ∈ {data_imported, draft_ready}; ≥3 players; every non-cinderella entity has odds | locks all `draftable_entities` + `scoring_configs`; status → `draft_ready` | `lock_pool` | `{ "success": true }` |
| `set_order` | — | sets `league_members.draft_position` (optionally shuffled); status → `draft_ready` | `set_draft_order` | `{ "success": true, "order": [uuid…] }` |
| `start` | status = `draft_ready`; ≥1 player with a draft_position | builds snake order, first segment → `active`, `draft_state` → active with first picker, status → `drafting`; emails the on-clock player | `start_draft` | `{ "success": true }` |
| `pause` | — | `draft_state.paused=true, status=paused` | `pause_draft` | `{ "success": true }` |
| `resume` | — | `draft_state.paused=false, status=active` | `resume_draft` | `{ "success": true }` |
| `undo` | at least one pick exists | deletes the last `draft_picks` row, rewinds `draft_state` to that pick | `undo_pick` (before_json = deleted pick) | `{ "success": true }` |
| `complete` | — | `draft_state.status=completed`; league status → `drafted` | `complete_draft` | `{ "success": true }` |

- **`lock_pool` 409 with detail:** if entities are missing odds, body is `{ "error": "Some entities are missing odds — fix or delete them before locking", "entities": [...] }`.
- **`undo` 409:** `{ "error": "No picks to undo" }`.
- **Side effects across actions:** `audit_logs` writes (per table above); on-clock email on `start` (`sendOnClockEmail`, fire-and-forget).
- **Note:** `skip` and `override` pass Zod validation but have no handler branch, so they fall through to the trailing `return` and yield `400 { "error": "Unknown action" }`. Any other unmatched action likewise returns `400`.

---

### GET `/api/admin/leagues/[leagueId]/scoring`

Fetch scoring configs + draft segments for the admin scoring-config page.

- **Auth:** `requireAdmin` → `401`.
- **Response 200:** `{ id, name, status, season_year, settings_json, scoring_configs(*), draft_segments(*) }`.
- **404:** `{ "error": <db error message> }`.

### PATCH `/api/admin/leagues/[leagueId]/scoring`

Update scoring formulas and/or per-category pick counts.

- **Auth:** `requireAdmin` → `401`.
- **Status gate:** `404` if league missing; editable only when status ∈ `{setup, data_imported, draft_ready}` else `409` ("Scoring is locked once the draft starts").
- **Body (JSON):**
  - `configs` (optional): array of `{ category: string, config_json: ScoringConfig }` where `ScoringConfig` = `{ formula: 'multiplier_odds_ratio'|'fixed_points'|'wins_over_baseline'|'inverted_record', outcomes?: Record<string,{multiplier?:number, points?:number}>, points_per_win?: number, points_per_loss?: number, winless_bonus?: number, floor?: number, cap?: number|null }`.
  - `pick_counts` (optional): `Record<string, int>` (each 0–30).
- **Config update:** for each entry, a locked `scoring_configs` row is skipped (never overwritten); otherwise `config_json` + `updated_at` are updated. Writes one `update_scoring_config` audit row per updated category (before/after = old/new config).
- **Pick-count update:** merges into `settings_json.pick_counts` and updates matching `draft_segments.pick_count_per_player`. Writes one `update_pick_counts` audit row (before/after = old/new counts).

| Status | Body |
| --- | --- |
| 200 | `{ "success": true, "league": <league with scoring_configs + draft_segments> }` |
| 401 | `{ "error": "Unauthorized" }` |
| 404 | `{ "error": "League not found" }` |
| 409 | `{ "error": "Scoring is locked once the draft starts" }` |
| 422 | `{ "error": <zod flatten> }` |
| 500 | `{ "error": <config or settings update error> }` |

---

### POST `/api/admin/leagues/[leagueId]/results`

Two-phase results endpoint. `action=publish` scores + publishes; any other
`action` (or none) is the upload/match phase.

- **Auth:** `requireAdmin` → `401`.
- **Content type:** `multipart/form-data`. Fields:
  - `category` (string) — required (`400` if missing)
  - `action` (string) — `'upload' | 'confirm_match' | 'publish'` (only `publish` is a distinct branch; everything else runs the upload path)
  - `file` (File) — required for the upload path; not read in the publish branch
  - `import_id` (string) — used by the publish branch

**Publish branch (`action === "publish"`):**

- Reads `result_rows` for `import_id` excluding `match_status='unmatched'` → `404` if none.
- Reads `draft_picks` (+ `draftable_entities`) and the locked `scoring_configs.config_json` for the category → `500` if either missing.
- For each pick, resolves the outcome/record inputs by category (Cinderella final AP rank → bucket via `cinderellaRankToOutcome`; Most Improved reads actual wins vs locked `preseason_win_total`; Disaster Draft reads wins/losses), runs `calculateScore`, and builds a `scores` row (`published: true`).
- **Side effects:**
  - Upserts `scores` (onConflict `draft_pick_id`) — **score upsert**.
  - Sets the `result_imports` row `status = 'published'`.
  - Writes an audit row `publish_standings` (after_json `{ category, scores: <count> }`).
  - Rebuilds standings and emails **all league members** the standings update via Resend (`sendStandingsEmail`, fire-and-forget).
- **200:** `{ "success": true, "scores": <count> }`. **500:** `{ "error": <score upsert error> }`.

**Upload branch (any other action):**

- Requires `file` (`400` if absent), max 5 MB (`413`), CSV/XLSX parse (`400` on parse error).
- Loads drafted entities for the category, inserts a `result_imports` row (`status: 'reviewing'`), fuzzy-matches each row (`findMatches`), and inserts `result_rows` (`match_status` ∈ `auto | fuzzy | unmatched`; fuzzy candidate ids stashed in `admin_notes`).
- **Side effects:** inserts `result_imports` + `result_rows`. No audit log, no email in this branch.
- **200:** `{ "import_id", "total", "auto_matched", "fuzzy_matched", "unmatched", "rows" }`. **500:** `{ "error": <import insert error> }`.

| Status | Cause |
| --- | --- |
| 200 | success (either branch) |
| 400 | `category required` / `file required` / `Parse error: …` |
| 401 | not admin |
| 404 | `No result rows found` (publish) |
| 413 | `File too large` (upload) |
| 500 | `Missing picks or config` / score upsert error / import insert error |

- **Note:** `action=confirm_match` has no dedicated branch; it falls into the upload path, which requires a `file`.

---

## Player / Member — Leagues

### GET `/api/leagues/[leagueId]/draft`

Current draft snapshot.

- **Auth:** `requireAuth` → `401`.
- **Response 200:** `{ draftState, picks, entities, members }` — `picks` join `draftable_entities`, ordered by `overall_pick_number`; `members` join `users`.

### POST `/api/leagues/[leagueId]/draft`

Submit the current player's pick. Serialized server-side; first commit wins.

- **Auth:** `requireAuth` → `401`.
- **Body (JSON):** `{ entity_id: uuid }` → `422` on failure.
- **Preconditions:**
  - `draft_state` must be `status='active'` and not `paused` → else `409` "Draft is not active".
  - Caller must be `draft_state.current_player_user_id` → else `403` "Not your pick".
  - Active segment must exist → else `409` "No active segment".
  - Entity must exist for this league → else `404` "Entity not found".
  - Entity must include the segment category in `eligible_categories_json` → else `422 { error, eligible: [...] }`.
  - Entity must not already be picked in this category → else `409` "Already drafted in this category".
- **Side effects:**
  - Inserts a `draft_picks` row (`locked_odds = entity.odds`, `admin_override: false`).
  - Advances `draft_state` (next picker/segment via snake schedule); when the schedule is exhausted, sets `draft_state.status='completed'` and league `status='drafted'`; may flip `draft_segments` statuses (`completed`/`active`).
  - Emails the next on-clock player (`sendOnClockEmail`, fire-and-forget).
  - No audit log for the player pick itself.

| Status | Body |
| --- | --- |
| 201 | the inserted `draft_picks` row |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Not your pick" }` |
| 404 | `{ "error": "Entity not found" }` |
| 409 | `"Draft is not active"` / `"No active segment"` / `"Already drafted in this category"` / `"Pick number already taken (concurrent pick conflict)"` (Postgres unique-violation `23505`) |
| 422 | `{ "error": <zod flatten> }` or `{ "error": "This pick is not eligible for category: …", "eligible": [...] }` |
| 500 | `{ "error": <insert error> }` |

---

### GET `/api/leagues/[leagueId]/standings`

Standings leaderboard + published-category milestones.

- **Auth:** `requireLeagueMember` → `401`.
- **Data:** builds standings from **published** `scores` only. If `settings_json.allow_provisional_visibility` is true **and** there are no published scores, it falls back to all (provisional) scores. `milestones` marks each category in `settings_json.draft_segment_order` (default the legacy four) that has a `result_imports` row with `status='published'`.
- **Response 200:** `{ standings, milestones, categories, as_of }` where `as_of` is the current ISO timestamp.

---

### GET `/api/leagues/[leagueId]/trash-talk`

List trash-talk posts.

- **Auth:** `requireLeagueMember` → `401`.
- **Response 200:** up to 500 non-deleted posts joined with `users(id, display_name)`, ordered `created_at` asc.
- **500:** `{ "error": <db error> }`.

### POST `/api/leagues/[leagueId]/trash-talk`

Create a trash-talk post.

- **Auth:** `requireLeagueMember` → `401`.
- **Body (JSON):** `{ body: string (1–500) }` → `422` on failure.
- **Gate:** `403` if `settings_json.trash_talk_enabled` is falsy ("Trash talk is disabled for this league").
- **Side effects:** inserts a `trash_talk_posts` row (`user_id` = caller). No audit log, no email.

| Status | Body |
| --- | --- |
| 201 | the inserted post joined with `users(id, display_name)` |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Trash talk is disabled for this league" }` |
| 422 | `{ "error": <zod flatten> }` |
| 500 | `{ "error": <insert error> }` |

### DELETE `/api/leagues/[leagueId]/trash-talk?id=<postId>`

Soft-delete a post.

- **Auth:** `requireLeagueMember` → `401`.
- **Query param:** `id` (post id) — `400` if missing.
- **Permission:** the caller must be the post's author, **or** `requireAdmin` must pass; otherwise `403`.
- **Side effects:** sets `deleted = true` on the post (soft delete). No audit log.

| Status | Body |
| --- | --- |
| 200 | `{ "success": true }` |
| 400 | `{ "error": "id required" }` |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Forbidden" }` |
| 404 | `{ "error": "Not found" }` |
