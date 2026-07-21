# Route Map

Complete map of every page and API route in CFB War Chest (Next.js 16 App Router).

**Auth legend**
- **public** — no authentication required.
- **authenticated** — any signed-in user (session only; no league/role check).
- **player-member** — must be a `league_members` row for the `[leagueId]` (via `requireLeagueMember`).
- **admin** — must have `role = 'admin'` (via `requireAdmin`).

Auth is derived from `requireAdmin` / `requireLeagueMember` / `requireAuth` / `getSessionUser` usage inside each file. Client-component pages carry no server-side guard themselves; their access is enforced by the API routes they call (noted inline).

---

## Table 1 — Pages (`src/app/**/page.tsx`)

| Route path | File | Purpose | Auth |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Root redirect: sends signed-in users to `/leagues`, otherwise to `/login`. | public (redirect gate) |
| `/login` | `src/app/login/page.tsx` | Magic-link (OTP) login form; emails a sign-in link via Supabase Auth. Client component. | public |
| `/leagues` | `src/app/leagues/page.tsx` | Lists the current user's league memberships. `getSessionUser`, redirects to `/login` if none. | authenticated |
| `/leagues/[leagueId]` | `src/app/leagues/[leagueId]/page.tsx` | League home/hub with status-gated nav (draft room, board, war chest, standings, trash talk). `requireLeagueMember`. | player-member |
| `/leagues/[leagueId]/draft` | `src/app/leagues/[leagueId]/draft/page.tsx` | Live draft room with Realtime updates and pick submission. Client component; loads via `GET /api/leagues/[leagueId]/draft`, redirects to `/login` on 401. | player-member (client; API `requireAuth`) |
| `/leagues/[leagueId]/draft-board` | `src/app/leagues/[leagueId]/draft-board/page.tsx` | Read-only snake-draft board grouped by round. `requireLeagueMember`. | player-member |
| `/leagues/[leagueId]/standings` | `src/app/leagues/[leagueId]/standings/page.tsx` | Season standings built from published scores + category milestone chips. `requireLeagueMember`. | player-member |
| `/leagues/[leagueId]/trash-talk` | `src/app/leagues/[leagueId]/trash-talk/page.tsx` | Realtime trash-talk chat. Client component; uses `/api/leagues/[leagueId]/trash-talk` and `/api/auth/me`. | player-member (client; API `requireLeagueMember`) |
| `/leagues/[leagueId]/war-chest` | `src/app/leagues/[leagueId]/war-chest/page.tsx` | The current user's own picks grouped by category with points. `requireLeagueMember`. | player-member |
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard: all leagues + create-league entry point. `requireAdmin`. | admin |
| `/admin/leagues/new` | `src/app/admin/leagues/new/page.tsx` | Create-league form (name, year, max players, conferences). Client component; posts to `/api/admin/leagues`. | admin (client; API `requireAdmin`) |
| `/admin/leagues/[leagueId]` | `src/app/admin/leagues/[leagueId]/page.tsx` | Admin league overview: members, invite form, and the `adminLinks` action list. `requireAdmin`. | admin |
| `/admin/leagues/[leagueId]/audit` | `src/app/admin/leagues/[leagueId]/audit/page.tsx` | Audit log viewer (latest 200 entries). `requireAdmin`. | admin |
| `/admin/leagues/[leagueId]/draft-control` | `src/app/admin/leagues/[leagueId]/draft-control/page.tsx` | Commissioner draft control (lock pool, set order, start/pause/resume/undo/complete). Client component; posts to `/api/admin/leagues/[leagueId]/draft`. | admin (client; API `requireAdmin`) |
| `/admin/leagues/[leagueId]/draft-setup` | `src/app/admin/leagues/[leagueId]/draft-setup/page.tsx` | Draft setup & scoring-config editor (category order, pick counts, per-category scoring). `requireAdmin`. | admin |
| `/admin/leagues/[leagueId]/import` | `src/app/admin/leagues/[leagueId]/import/page.tsx` | Upload/parse preseason data CSV per category. Client component; posts to `/api/admin/leagues/[leagueId]/import`. | admin (client; API `requireAdmin`) |

### Admin pages: LINKED vs PRESENT

The `adminLinks` array in `src/app/admin/leagues/[leagueId]/page.tsx` links six admin destinations. Comparing them against the `page.tsx` files that actually exist:

| Linked href | Label | Page file exists? | Status |
|---|---|---|---|
| `/admin/leagues/[leagueId]/import` | 📥 Import Preseason Data | yes (`import/page.tsx`) | **PRESENT** |
| `/admin/leagues/[leagueId]/draft-setup` | ⚙️ Draft Setup & Scoring Config | yes (`draft-setup/page.tsx`) | **PRESENT** |
| `/admin/leagues/[leagueId]/draft-control` | 🎙 Draft Control | yes (`draft-control/page.tsx`) | **PRESENT** |
| `/admin/leagues/[leagueId]/results` | 📊 Upload Results & Score | **no page.tsx** | **MISSING** — link 404s at the page level even though the `results` API route (`POST /api/admin/leagues/[leagueId]/results`) exists. |
| `/admin/leagues/[leagueId]/standings-review` | 🏆 Standings Review | **no page.tsx** | **MISSING** — no page and no API route; no `standings-review` directory exists at all. |
| `/admin/leagues/[leagueId]/audit` | 📋 Audit Log | yes (`audit/page.tsx`) | **PRESENT** |

> The missing links are conditionally shown by league status (`results` for `drafted`/`scoring`/`completed`; `standings-review` for `scoring`/`completed`), so they only surface late in a league's lifecycle.

---

## Table 2 — API routes (`src/app/api/**/route.ts`, plus `src/app/auth/callback`)

| Route path | Method(s) | Purpose | Auth |
|---|---|---|---|
| `/auth/callback` | GET | Exchanges the magic-link `code` for a Supabase session, then redirects to `redirectTo` (default `/leagues`). Not under `/api`. | public |
| `/api/auth/bootstrap` | POST | One-time creation of the initial admin account from `BOOTSTRAP_ADMIN_EMAIL`/`_NAME` env vars; refuses (409) if any admin already exists. | public (self-guarded; no admin may exist) |
| `/api/auth/me` | GET | Returns the signed-in user's `{ id, email, display_name, role }`; 401 if not signed in. `getSessionUser`. | authenticated |
| `/api/auth/invite` | POST | Invites a player to a league (creates/links user + membership, sends invite email). `requireAdmin`. | admin |
| `/api/admin/leagues` | POST, GET | POST creates a league (with conferences/settings); GET lists all leagues. Both `requireAdmin`. | admin |
| `/api/admin/leagues/[leagueId]` | GET, PATCH | GET returns league detail; PATCH updates league settings (trash-talk/moderation flags always editable, other settings locked once draft starts). Both `requireAdmin`. | admin |
| `/api/admin/leagues/[leagueId]/draft` | POST | Commissioner draft actions dispatched by `action`: `lock_pool`, `set_order`, `start`, `pause`, `resume`, `undo`, `complete`. `requireAdmin`. | admin |
| `/api/admin/leagues/[leagueId]/import` | POST | Uploads and parses a preseason-data CSV for a category (multipart form: `file`, `category`); returns imported rows + validation flags. `requireAdmin`. | admin |
| `/api/admin/leagues/[leagueId]/results` | POST | Results workflow dispatched by form `action` (`upload` / `confirm_match` / `publish`): parses results, matches entities, and on `publish` runs the scoring engine and writes published scores. `requireAdmin`. | admin |
| `/api/admin/leagues/[leagueId]/scoring` | GET, PATCH | GET returns league + scoring configs + segments; PATCH updates scoring config / draft settings (locked once the draft starts). Both `requireAdmin`. | admin |
| `/api/leagues/[leagueId]/draft` | POST, GET | POST submits a draft pick (server-serialized; enforces draft active + caller is the current drafter); GET returns current draft state, picks, entities, and members. Both `requireAuth`. | authenticated (POST additionally requires being the on-clock drafter) |
| `/api/leagues/[leagueId]/standings` | GET | Returns computed standings from published scores (falls back to provisional if `allow_provisional_visibility`). `requireLeagueMember`. | player-member |
| `/api/leagues/[leagueId]/trash-talk` | GET, POST, DELETE | GET lists non-deleted posts; POST creates a post; DELETE soft-deletes a post (author only, unless `requireAdmin` for moderation override). GET/POST/DELETE use `requireLeagueMember`. | player-member (DELETE allows admin override) |

### Dynamic segments

- `[leagueId]` — league UUID; appears in every `/leagues/*`, `/admin/leagues/[leagueId]/*`, and corresponding API path.
- `redirectTo` / `code` on `/auth/callback` and `?error=` on `/login` are query params, not path segments.
- Trash-talk `DELETE` takes the target post via `?id=` query param.
