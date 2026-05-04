/**
 * NFL API Adapter Interface
 *
 * This file defines the interface contract all NFL data providers must implement.
 * To swap in a real provider (SportsData.io, Sleeper, API-Sports, etc.):
 *
 *   1. Create a new file in this directory, e.g. sportsDataProvider.js
 *   2. Implement every function defined in the NFLApiAdapter class below
 *   3. Set NFL_API_PROVIDER=sportsdata (or your provider key) in .env
 *   4. Add a case to getProvider() below pointing to your file
 *   5. Add your API key to .env as NFL_API_KEY (or provider-specific var)
 *
 * TODO: integrate a real provider when available.
 */

const provider = process.env.NFL_API_PROVIDER || 'mock';

function getProvider() {
  switch (provider) {
    case 'mock':
      return require('./mockProvider');

    // TODO: add real provider cases here, e.g.:
    // case 'sportsdata':
    //   return require('./sportsDataProvider');
    // case 'sleeper':
    //   return require('./sleeperProvider');
    // case 'apisports':
    //   return require('./apiSportsProvider');

    default:
      console.warn(`Unknown NFL_API_PROVIDER "${provider}", falling back to mock.`);
      return require('./mockProvider');
  }
}

const nflApi = getProvider();

/**
 * Get all playoff games for a given week.
 * @param {string} weekId  - internal playoff_weeks.id
 * @returns {Promise<Array<{ id, homeTeam, awayTeam, kickoffTime }>>}
 */
async function getNFLPlayoffGames(weekId) {
  return nflApi.getNFLPlayoffGames(weekId);
}

/**
 * Get all players eligible to be picked in a given week.
 * @param {string} weekId
 * @returns {Promise<Array<{ id, fullName, position, nflTeam, externalId }>>}
 */
async function getEligiblePlayers(weekId) {
  return nflApi.getEligiblePlayers(weekId);
}

/**
 * Get player stats for a given week.
 * @param {string} weekId
 * @returns {Promise<Array<PlayerStats>>}
 */
async function getPlayerStats(weekId) {
  return nflApi.getPlayerStats(weekId);
}

/**
 * Get kickoff times for all games in a given week.
 * @param {string} weekId
 * @returns {Promise<Array<{ gameId, homeTeam, awayTeam, kickoffTime }>>}
 */
async function getKickoffTimes(weekId) {
  return nflApi.getKickoffTimes(weekId);
}

module.exports = { getNFLPlayoffGames, getEligiblePlayers, getPlayerStats, getKickoffTimes };
