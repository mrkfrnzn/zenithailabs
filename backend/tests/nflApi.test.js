/**
 * Tests for the NFL API adapter layer.
 * These run against the mock provider using the seeded SQLite database.
 */

// Set up a test DB in-memory
process.env.DATABASE_PATH = ':memory:';
process.env.NFL_API_PROVIDER = 'mock';

const path = require('path');
const fs   = require('fs');

// Bootstrap schema + seed
beforeAll(() => {
  // Run migration to set up tables
  const { getDb } = require('../db/database');
  const db = getDb();
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.exec(schema); // exec handles multi-statement SQL + PRAGMAs natively

  // Insert minimal test data
  const { v4: uuidv4 } = require('uuid');
  const userId  = uuidv4();
  const leagueId = uuidv4();
  const seasonId = uuidv4();
  db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').run(userId, 'test@test.com', 'admin');
  db.prepare('INSERT INTO leagues (id, name, entry_fee, created_by) VALUES (?, ?, ?, ?)').run(leagueId, 'Test', 50, userId);
  db.prepare('INSERT INTO seasons (id, league_id, nfl_season) VALUES (?, ?, ?)').run(seasonId, leagueId, 2024);

  const weekId = uuidv4();
  db.prepare('INSERT INTO playoff_weeks (id, season_id, week_number, label) VALUES (?, ?, ?, ?)').run(weekId, seasonId, 1, 'Wild Card Week');

  const playerId = uuidv4();
  db.prepare('INSERT INTO nfl_players (id, full_name, position, nfl_team) VALUES (?, ?, ?, ?)').run(playerId, 'Test QB', 'QB', 'TST');

  const gameId = uuidv4();
  db.prepare('INSERT INTO nfl_games (id, week_id, home_team, away_team, kickoff_time) VALUES (?, ?, ?, ?, ?)').run(gameId, weekId, 'TST', 'OPP', '2025-01-11T18:00:00Z');

  const statsId = uuidv4();
  db.prepare('INSERT INTO player_stats (id, player_id, week_id, passing_yards, passing_tds, interceptions, source) VALUES (?, ?, ?, ?, ?, ?, ?)').run(statsId, playerId, weekId, 300, 2, 1, 'mock');

  // Stash IDs for use in tests
  global._testWeekId   = weekId;
  global._testPlayerId = playerId;
});

const adapter = require('../services/nflApi/adapter');

describe('NFL API Adapter — mock provider', () => {
  test('getNFLPlayoffGames returns games for a week', async () => {
    const games = await adapter.getNFLPlayoffGames(global._testWeekId);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
    expect(games[0]).toHaveProperty('homeTeam');
    expect(games[0]).toHaveProperty('awayTeam');
    expect(games[0]).toHaveProperty('kickoffTime');
  });

  test('getEligiblePlayers returns players', async () => {
    const players = await adapter.getEligiblePlayers(global._testWeekId);
    expect(Array.isArray(players)).toBe(true);
    expect(players.length).toBeGreaterThan(0);
    expect(players[0]).toHaveProperty('fullName');
    expect(players[0]).toHaveProperty('position');
  });

  test('getPlayerStats returns stats for a week', async () => {
    const stats = await adapter.getPlayerStats(global._testWeekId);
    expect(Array.isArray(stats)).toBe(true);
    expect(stats.length).toBeGreaterThan(0);
    const stat = stats[0];
    expect(stat).toHaveProperty('passingYards');
    expect(stat).toHaveProperty('interceptions');
    expect(stat.playerId).toBe(global._testPlayerId);
  });

  test('getKickoffTimes returns games', async () => {
    const times = await adapter.getKickoffTimes(global._testWeekId);
    expect(Array.isArray(times)).toBe(true);
  });

  test('adapter interface matches contract', () => {
    expect(typeof adapter.getNFLPlayoffGames).toBe('function');
    expect(typeof adapter.getEligiblePlayers).toBe('function');
    expect(typeof adapter.getPlayerStats).toBe('function');
    expect(typeof adapter.getKickoffTimes).toBe('function');
  });
});
