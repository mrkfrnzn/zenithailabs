# CFB War Chest

A college football futures fantasy game where commissioners draft preseason long-shot picks and watch them pay off across bowl season. Players draft athletes and teams before the season locks, then score points as their picks advance through conferences, the CFP, and the Heisman ceremony — with bigger paydays for longer-shot selections.

## Tech Stack

- **Next.js 15** — App Router, Server Components, Server Actions
- **Prisma + SQLite** — local-first persistence (swap to Postgres for production)
- **Tailwind CSS v3** — utility-first styling with custom sportsbook-themed components
- **Vitest** — unit tests for pure scoring/draft functions
- **Server-Sent Events** — realtime draft room and trash talk updates (no external broker required)

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Edit SESSION_SECRET to a random 32+ character string for production

# 3. Push schema, generate client, and seed the database
npm run setup

# 4. Start the dev server
npm run dev
```

App runs at http://localhost:3000.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | SQLite file path | `file:./dev.db` |
| `SESSION_SECRET` | Cookie signing secret (32+ chars) | `change-me-please-this-must-be-32-bytes-or-more` |
| `ADMIN_EMAIL` | Bootstrap admin email | `admin@warchest.local` |
| `ADMIN_PASSWORD` | Bootstrap admin password | `admin123` |
| `ADMIN_NAME` | Admin display name | `Commissioner` |
| `NEXT_PUBLIC_APP_NAME` | App title shown in UI | `CFB War Chest` |

## Default Credentials (after `npm run setup`)

| Role | Email | Password |
|---|---|---|
| Admin / Commissioner | admin@warchest.local | admin123 |
| Player 1 | player1@warchest.local | player123 |
| Player 2 | player2@warchest.local | player123 |
| Player 3 | player3@warchest.local | player123 |
| Player 4 | player4@warchest.local | player123 |
| Player 5 | player5@warchest.local | player123 |
| Player 6 | player6@warchest.local | player123 |

The seed also creates a ready-to-draft league called **"The Group Chat 2025"** with all 6 players added and a full entity pool locked.

## Admin Workflow

### 1. Create a League

Admin → **Create League** — sets league name and season year. Default scoring configs and draft segments are created automatically.

### 2. Import Preseason Data

Admin → League → **Import Entities** — upload `sample_data/sample_preseason_data.csv` (or your own CSV/XLSX). Each row becomes a draftable entity. After parsing, toggle which categories each entity is eligible for (Heisman / CFP / Cinderella / Conference Champion) and set or edit locked odds before finalizing. Hit **Lock Pool** when ready.

### 3. Configure Draft Settings

Admin → League → **Draft Setup** — adjust per-category pick counts per player, scoring multipliers, exclusivity rules (global or per-category), and the auto-advance timer.

### 4. Manage Players

Admin → League → **Overview** — add players by email, assign draft positions, or randomize order.

### 5. Run the Draft

Admin → League → **Draft Control** — start, pause, and resume the draft. Players connect to the live draft room at `/leagues/[id]/draft`. The admin can override picks, undo the last pick, or reset the entire draft.

### 6. Import Results

Admin → League → **Import Results** — select result type (Heisman / CFP / Cinderella / Conference Champion), upload the corresponding CSV. Parsed rows are auto-matched against draftable entities by normalized name. Resolve any unmatched rows using the dropdowns, then click **Apply Import** to trigger a full score recalculation.

### 7. Review and Publish Standings

Admin → League → **Standings Review** — see provisional standings with per-pick formula breakdowns. Hit **Recalculate** to refresh, then **Publish** to make standings visible to all players.

## Sample Data

The `sample_data/` directory contains ready-to-use import files:

| File | Use |
|---|---|
| `sample_preseason_data.csv` | Preseason entity pool — upload to Import Entities |
| `sample_heisman_results.csv` | Heisman winner + finalists |
| `sample_cfp_results.csv` | CFP outcomes for all teams |
| `sample_cinderella_results.csv` | Final AP ranks for cinderella schools |
| `sample_conference_results.csv` | Conference championship outcomes |

## Scoring Formula

Points are scaled by the relative difficulty of a pick using American moneyline odds at draft time.

### Heisman

```
winner:             multiplier × (player_odds / lowest_odds_in_category)
finalist_non_winner: finalist_multiplier × (player_odds / lowest_odds_in_category)
```

Default multipliers: **winner = 350**, **finalist = 100**

### CFP

| Outcome | Base Points |
|---|---|
| Wins national title | 300 |
| Loses championship game | 200 |
| Loses semifinal | 100 |
| Makes playoff (first round out) | 50 |
| Misses playoff | 0 |

Each outcome: `base × (player_odds / lowest_odds_in_category)`

### Cinderella

Fixed points based on final AP ranking (no odds multiplier):

| Final AP Rank | Points |
|---|---|
| Top 10 | 150 |
| 11–20 | 75 |
| 21–25 | 40 |
| Unranked | 0 |

### Conference Champion

```
wins_conference_title_game:  150 × (player_odds / lowest_odds_in_conference)
loses_conference_title_game:  75 × (player_odds / lowest_odds_in_conference)
fails_to_qualify:              0
```

The lowest-odds denominator is scoped to picks within the **same conference**, so long-shot conference picks pay out proportionally more.

## Running Tests

```bash
npm test
```

Covers: `lowestDraftedOdds`, `scoreHeisman`, `scoreCfp`, `scoreCinderella`, `scoreConferenceChampion`, `buildSnakeOrder`, `totalPicksFor` — 24 tests total.

## Project Structure

```
src/
  app/
    admin/leagues/[leagueId]/
      import/        # Preseason entity import
      draft-setup/   # Scoring + segment config
      draft-control/ # Live draft management
      results/       # End-of-season results import
      standings-review/ # Provisional standings + publish
    leagues/[leagueId]/
      draft/         # Live draft room (SSE)
      war-chest/     # Player roster + scores
      draft-board/   # Full board by player
      standings/     # Published standings
      trash-talk/    # Trash talk board (SSE)
  components/
    DraftRoom.tsx    # Live draft client (EventSource)
    TrashTalkBoard.tsx
  lib/
    scoring.ts       # Pure scoring engine
    draft.ts         # Snake order generator
    draftEngine.ts   # Draft state machine
    scoringRunner.ts # DB-backed score orchestration
    resultsParser.ts # CSV result row parsing
    events.ts        # In-process SSE pub/sub bus
prisma/
  schema.prisma
  seed.ts
sample_data/         # Sample CSV import files
```
