# NFL Fantasy Playoff Survivor League

A full-stack web app for running an NFL Fantasy Playoff Survivor League.
Players pick a QB, RB, and WR/TE each playoff week without ever reusing a player.
Highest scorer after the Super Bowl wins the pot.

---

## Tech Stack

| Layer        | Technology                              |
|-------------|------------------------------------------|
| Frontend    | React 19, React Router, Tailwind CSS     |
| Backend     | Node.js, Express                         |
| Database    | SQLite (via better-sqlite3)              |
| Auth        | Magic-link email login + JWT             |
| Sports Data | Adapter/provider pattern (mock default)  |
| Tests       | Jest + Supertest                         |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Clone and install

```bash
git clone <repo-url>
cd zenithailabs

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` — the defaults work for local dev. The only required change for production is `JWT_SECRET`.

### 3. Migrate the database and load seed data

```bash
cd backend
node db/seed.js
cd ..
```

This creates `data/survivor.db` and loads:
- 1 admin user: `admin@zenithailabs.com`
- 7 player accounts: `alice@example.com`, `bob@example.com`, `charlie@example.com`, `diana@example.com`, `evan@example.com`, `fiona@example.com`, `george@example.com`
- 28 NFL players (QBs, RBs, WRs, TEs)
- 4 playoff weeks with sample lock times
- Sample lineups for Weeks 1 and 2
- Sample player stats
- Payout rules for all tier sizes

### 4. Start the backend

```bash
cd backend
npm start          # or: npm run dev  (auto-restarts on file changes)
```

The API will be available at `http://localhost:3001`.

### 5. Start the frontend (in a separate terminal)

```bash
# from project root
npm start
```

The app will open at `http://localhost:3000`.

### 6. Log in

1. Go to `http://localhost:3000`
2. Click **Join / Log In**
3. Enter any of the seed email addresses
4. The magic link will be **printed to the backend console** (no email config needed in dev)
5. Copy the link and open it in your browser

---

## Running Tests

Backend tests (Jest + Supertest):

```bash
cd backend
npm test
```

Tests cover:
- Scoring engine (yards, TDs, INTs, no-negative QB rush)
- No-repeat player rule enforcement
- Lineup lock deadline enforcement
- Payout calculations (all 6 tiers)
- Role-based access control (admin vs player)
- NFL API adapter / mock provider
- Standings ranking

Frontend tests (CRA default):

```bash
# from project root
npm test
```

---

## Environment Variables

See `.env.example` for the full list with comments.

Key variables:

| Variable              | Default                   | Description                              |
|-----------------------|---------------------------|------------------------------------------|
| `PORT`                | `3001`                    | Backend server port                      |
| `DATABASE_PATH`       | `./data/survivor.db`      | SQLite file path                         |
| `JWT_SECRET`          | `change_me_...`           | **Change in production**                 |
| `APP_URL`             | `http://localhost:3000`   | Frontend URL (used in magic link emails) |
| `REACT_APP_API_URL`   | `http://localhost:3001`   | Backend API URL (read by React)          |
| `NFL_API_PROVIDER`    | `mock`                    | NFL data provider key                    |
| `SMTP_HOST`           | *(blank)*                 | SMTP server for email delivery           |

---

## How to Swap in a Real NFL Stats API

The app uses a **provider adapter pattern**. All NFL data flows through:

```
src/api/client.js  →  backend/services/nflApi/adapter.js  →  [provider]
```

### Steps to add a real provider

1. Create a new file in `backend/services/nflApi/`, e.g. `sportsDataProvider.js`

2. Implement these four functions (same signatures as `mockProvider.js`):

```js
async function getNFLPlayoffGames(weekId) { ... }
async function getEligiblePlayers(weekId) { ... }
async function getPlayerStats(weekId)     { ... }
async function getKickoffTimes(weekId)    { ... }

module.exports = { getNFLPlayoffGames, getEligiblePlayers, getPlayerStats, getKickoffTimes };
```

3. Register your provider in `backend/services/nflApi/adapter.js`:

```js
// Add a case in the getProvider() switch:
case 'sportsdata':
  return require('./sportsDataProvider');
```

4. Set in `.env`:

```
NFL_API_PROVIDER=sportsdata
NFL_API_KEY=your_api_key_here
```

### Provider Notes

| Provider       | Key          | Docs / Notes                                    |
|----------------|--------------|-------------------------------------------------|
| SportsData.io  | `sportsdata` | https://sportsdata.io — paid, comprehensive     |
| Sleeper API    | `sleeper`    | https://docs.sleeper.com — free, no key needed  |
| API-Sports     | `apisports`  | https://api-sports.io — freemium                |
| ESPN (scrape)  | —            | No official API; not recommended                |

---

## Project Structure

```
zenithailabs/
├── backend/
│   ├── server.js                  # Express entry point
│   ├── db/
│   │   ├── schema.sql             # Full DB schema (15 tables)
│   │   ├── database.js            # SQLite connection singleton
│   │   ├── migrate.js             # Schema migration runner
│   │   └── seed.js                # Demo data seeder
│   ├── middleware/
│   │   └── auth.js                # JWT require/admin middleware
│   ├── routes/
│   │   ├── auth.js                # Magic link + JWT verify
│   │   ├── players.js             # NFL player lookup
│   │   ├── lineups.js             # Lineup submit/view
│   │   ├── scores.js              # Score calculation + retrieval
│   │   ├── standings.js           # Season standings
│   │   ├── payouts.js             # Payout projections
│   │   └── admin.js               # All admin management routes
│   ├── services/
│   │   ├── scoringEngine.js       # Pure scoring functions
│   │   ├── payoutService.js       # Pure payout functions
│   │   ├── auditService.js        # Centralized audit logging
│   │   └── nflApi/
│   │       ├── adapter.js         # Provider interface + switcher
│   │       └── mockProvider.js    # Default mock (uses seeded DB)
│   └── tests/
│       ├── scoringEngine.test.js
│       ├── payoutService.test.js
│       ├── nflApi.test.js
│       └── lineupRules.test.js
├── src/
│   ├── App.js                     # Router + auth guards
│   ├── api/client.js              # Axios API client (all endpoints)
│   ├── contexts/AuthContext.js    # JWT auth state
│   ├── pages/
│   │   ├── LandingPage.js         # Public marketing/rules page
│   │   ├── LoginPage.js           # Magic link request form
│   │   ├── MagicLinkPage.js       # Token verify + redirect
│   │   ├── PlayerDashboard.js     # Player picks, standings, payouts
│   │   └── AdminDashboard.js      # Full admin management UI
│   └── components/
│       ├── Navbar.js
│       ├── LineupBuilder.js       # Pick QB/RB/FLEX with validation
│       ├── PicksHistory.js        # Weekly picks + per-slot scores
│       ├── Standings.js           # League rankings table
│       └── PayoutTable.js         # Payout projections display
├── .env.example                   # All env vars documented
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## Scoring Rules

| Stat                  | Points        |
|-----------------------|---------------|
| Yards (all types)     | +1 per yard   |
| Touchdowns (all)      | +25 each      |
| Interceptions (QB)    | -25 each      |
| QB Rushing Yards      | Always +1/yd  |

No negative points for QB rushing yards (they simply add to total).

---

## Payout Tiers

| Players  | 1st  | 2nd | 3rd  | 4th | House |
|----------|------|-----|------|-----|-------|
| 1 – 5    | 90%  | —   | —    | —   | 10%   |
| 6 – 10   | 70%  | 20% | —    | —   | 10%   |
| 11 – 15  | 60%  | 25% | 5%   | —   | 10%   |
| 16 – 20  | 55%  | 25% | 10%  | —   | 10%   |
| 21 – 30  | 50%  | 25% | 15%  | —   | 10%   |
| 31 – 50  | 50%  | 20% | 15%  | 5%  | 10%   |

---

## TODOs / Configurable Points

- `NFL_API_PROVIDER`: swap mock for a real provider (see above)
- `SMTP_*`: configure real email delivery (Mailgun, SendGrid, etc.)
- Lineup override UI in AdminDashboard (API endpoint exists; UI is a stub)
- Player elimination logic (currently not auto-computed)
- Payment recording UI (admin can mark paid; Venmo/Zelle integration not included)
- Season archival and multi-season history views
