/**
 * Mock NFL API Provider
 *
 * Returns data from the local SQLite database (seeded data).
 * This lets the app work without an external API key during development.
 *
 * TODO: Replace this provider with a real one by creating e.g. sportsDataProvider.js
 *       and updating NFL_API_PROVIDER in .env.
 */

const { getDb } = require('../../db/database');

async function getNFLPlayoffGames(weekId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, week_id, home_team, away_team, kickoff_time, external_id
    FROM nfl_games WHERE week_id = ?
  `).all(weekId);

  return rows.map(r => ({
    id:          r.id,
    weekId:      r.week_id,
    homeTeam:    r.home_team,
    awayTeam:    r.away_team,
    kickoffTime: r.kickoff_time,
    externalId:  r.external_id,
  }));
}

async function getEligiblePlayers(weekId) {
  const db = getDb();
  // Return all active players; in a real provider this would filter to
  // only players on teams still alive in the playoffs that week.
  const rows = db.prepare(`
    SELECT id, full_name, position, nfl_team, external_id
    FROM nfl_players WHERE active = 1
    ORDER BY position, full_name
  `).all();

  return rows.map(r => ({
    id:         r.id,
    fullName:   r.full_name,
    position:   r.position,
    nflTeam:    r.nfl_team,
    externalId: r.external_id,
  }));
}

async function getPlayerStats(weekId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      ps.id, ps.player_id, ps.week_id,
      ps.passing_yards, ps.rushing_yards, ps.receiving_yards,
      ps.passing_tds, ps.rushing_tds, ps.receiving_tds,
      ps.interceptions, ps.source,
      np.full_name, np.position, np.nfl_team
    FROM player_stats ps
    JOIN nfl_players np ON np.id = ps.player_id
    WHERE ps.week_id = ?
  `).all(weekId);

  return rows.map(r => ({
    id:              r.id,
    playerId:        r.player_id,
    weekId:          r.week_id,
    passingYards:    r.passing_yards,
    rushingYards:    r.rushing_yards,
    receivingYards:  r.receiving_yards,
    passingTds:      r.passing_tds,
    rushingTds:      r.rushing_tds,
    receivingTds:    r.receiving_tds,
    interceptions:   r.interceptions,
    source:          r.source,
    fullName:        r.full_name,
    position:        r.position,
    nflTeam:         r.nfl_team,
  }));
}

async function getKickoffTimes(weekId) {
  return getNFLPlayoffGames(weekId);
}

module.exports = { getNFLPlayoffGames, getEligiblePlayers, getPlayerStats, getKickoffTimes };
