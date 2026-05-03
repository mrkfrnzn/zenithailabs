-- NFL Fantasy Playoff Survivor League - Database Schema
-- Uses SQLite via better-sqlite3

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role        TEXT NOT NULL DEFAULT 'player', -- 'player' | 'admin'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- MAGIC LINK TOKENS (auth)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0, -- 0 = unused, 1 = used
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- LEAGUES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  entry_fee   REAL NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- SEASONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id          TEXT PRIMARY KEY,
  league_id   TEXT NOT NULL REFERENCES leagues(id),
  nfl_season  INTEGER NOT NULL,        -- e.g. 2024
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'complete'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- PLAYOFF WEEKS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS playoff_weeks (
  id          TEXT PRIMARY KEY,
  season_id   TEXT NOT NULL REFERENCES seasons(id),
  week_number INTEGER NOT NULL,        -- 1=WildCard, 2=Divisional, 3=Conference, 4=SuperBowl
  label       TEXT NOT NULL,           -- "Wild Card Week", etc.
  lock_time   TEXT,                    -- ISO datetime when picks lock
  scoring_complete INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(season_id, week_number)
);

-- ─────────────────────────────────────────────
-- PARTICIPANT ENTRIES  (one per user per season)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participant_entries (
  id          TEXT PRIMARY KEY,
  season_id   TEXT NOT NULL REFERENCES seasons(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  paid        INTEGER NOT NULL DEFAULT 0,  -- 0 = unpaid, 1 = paid
  eliminated  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(season_id, user_id)
);

-- ─────────────────────────────────────────────
-- NFL PLAYERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nfl_players (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  position      TEXT NOT NULL,         -- 'QB' | 'RB' | 'WR' | 'TE'
  nfl_team      TEXT NOT NULL,
  external_id   TEXT,                  -- ID from external API provider
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- NFL GAMES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nfl_games (
  id            TEXT PRIMARY KEY,
  week_id       TEXT NOT NULL REFERENCES playoff_weeks(id),
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  kickoff_time  TEXT,
  external_id   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- WEEKLY LINEUPS  (one per participant per week)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_lineups (
  id            TEXT PRIMARY KEY,
  entry_id      TEXT NOT NULL REFERENCES participant_entries(id),
  week_id       TEXT NOT NULL REFERENCES playoff_weeks(id),
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  admin_override INTEGER NOT NULL DEFAULT 0,
  override_by   TEXT REFERENCES users(id),
  override_at   TEXT,
  UNIQUE(entry_id, week_id)
);

-- ─────────────────────────────────────────────
-- LINEUP SLOTS  (slots within a lineup)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lineup_slots (
  id            TEXT PRIMARY KEY,
  lineup_id     TEXT NOT NULL REFERENCES weekly_lineups(id),
  slot_type     TEXT NOT NULL,         -- 'QB' | 'RB' | 'FLEX'
  player_id     TEXT NOT NULL REFERENCES nfl_players(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lineup_id, slot_type)
);

-- ─────────────────────────────────────────────
-- PLAYER STATS  (per player per week)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_stats (
  id              TEXT PRIMARY KEY,
  player_id       TEXT NOT NULL REFERENCES nfl_players(id),
  week_id         TEXT NOT NULL REFERENCES playoff_weeks(id),
  passing_yards   INTEGER NOT NULL DEFAULT 0,
  rushing_yards   INTEGER NOT NULL DEFAULT 0,
  receiving_yards INTEGER NOT NULL DEFAULT 0,
  passing_tds     INTEGER NOT NULL DEFAULT 0,
  rushing_tds     INTEGER NOT NULL DEFAULT 0,
  receiving_tds   INTEGER NOT NULL DEFAULT 0,
  interceptions   INTEGER NOT NULL DEFAULT 0,
  raw_data        TEXT,                -- JSON blob from API provider
  source          TEXT DEFAULT 'mock', -- 'mock' | 'sportsdata' | 'sleeper' | etc.
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, week_id)
);

-- ─────────────────────────────────────────────
-- WEEKLY SCORES  (computed per lineup per week)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_scores (
  id            TEXT PRIMARY KEY,
  lineup_id     TEXT NOT NULL UNIQUE REFERENCES weekly_lineups(id),
  entry_id      TEXT NOT NULL REFERENCES participant_entries(id),
  week_id       TEXT NOT NULL REFERENCES playoff_weeks(id),
  qb_points     REAL NOT NULL DEFAULT 0,
  rb_points     REAL NOT NULL DEFAULT 0,
  flex_points   REAL NOT NULL DEFAULT 0,
  total_points  REAL NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entry_id, week_id)
);

-- ─────────────────────────────────────────────
-- STANDINGS  (cumulative across all weeks)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS standings (
  id              TEXT PRIMARY KEY,
  season_id       TEXT NOT NULL REFERENCES seasons(id),
  entry_id        TEXT NOT NULL REFERENCES participant_entries(id),
  total_points    REAL NOT NULL DEFAULT 0,
  rank            INTEGER,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(season_id, entry_id)
);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES participant_entries(id),
  amount      REAL NOT NULL,
  method      TEXT,                    -- e.g. 'Venmo', 'Cash', 'Zelle'
  note        TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- PAYOUT RULES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_rules (
  id              TEXT PRIMARY KEY,
  season_id       TEXT NOT NULL REFERENCES seasons(id),
  min_players     INTEGER NOT NULL,
  max_players     INTEGER NOT NULL,
  first_pct       REAL NOT NULL DEFAULT 0,
  second_pct      REAL NOT NULL DEFAULT 0,
  third_pct       REAL NOT NULL DEFAULT 0,
  fourth_pct      REAL NOT NULL DEFAULT 0,
  house_pct       REAL NOT NULL DEFAULT 10,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- PAYOUT RESULTS  (calculated when season closes)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_results (
  id              TEXT PRIMARY KEY,
  season_id       TEXT NOT NULL REFERENCES seasons(id),
  entry_id        TEXT REFERENCES participant_entries(id),
  rank            INTEGER,             -- NULL for 'house'
  label           TEXT NOT NULL,       -- '1st Place', 'House', etc.
  pct             REAL NOT NULL,
  amount          REAL NOT NULL,
  calculated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,           -- e.g. 'lineup_submitted', 'score_calculated', 'admin_override'
  actor_id    TEXT REFERENCES users(id),
  target_type TEXT,                    -- e.g. 'lineup', 'score', 'participant'
  target_id   TEXT,
  details     TEXT,                    -- JSON blob
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_magic_tokens_token   ON magic_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_user    ON magic_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_lineups_entry_week   ON weekly_lineups(entry_id, week_id);
CREATE INDEX IF NOT EXISTS idx_slots_lineup         ON lineup_slots(lineup_id);
CREATE INDEX IF NOT EXISTS idx_stats_player_week    ON player_stats(player_id, week_id);
CREATE INDEX IF NOT EXISTS idx_scores_entry_week    ON weekly_scores(entry_id, week_id);
CREATE INDEX IF NOT EXISTS idx_standings_season     ON standings(season_id, rank);
CREATE INDEX IF NOT EXISTS idx_audit_action         ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_entries_season       ON participant_entries(season_id);
