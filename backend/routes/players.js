const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { getEligiblePlayers } = require('../services/nflApi/adapter');

const router = express.Router();

/**
 * GET /api/players
 * All active NFL players (optionally filter by position).
 */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { position } = req.query;
  let query = 'SELECT * FROM nfl_players WHERE active = 1';
  const params = [];
  if (position) {
    query += ' AND position = ?';
    params.push(position.toUpperCase());
  }
  query += ' ORDER BY position, full_name';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(r => ({
    id:       r.id,
    fullName: r.full_name,
    position: r.position,
    nflTeam:  r.nfl_team,
  })));
});

/**
 * GET /api/players/eligible/:weekId
 * Players eligible for selection this week (via adapter — swappable).
 */
router.get('/eligible/:weekId', requireAuth, async (req, res) => {
  try {
    const players = await getEligiblePlayers(req.params.weekId);
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/players/used/:entryId
 * Returns all player IDs already used by an entry in previous weeks.
 */
router.get('/used/:entryId', requireAuth, (req, res) => {
  const db = getDb();
  const { entryId } = req.params;
  const rows = db.prepare(`
    SELECT DISTINCT ls.player_id, np.full_name, np.position, np.nfl_team, pw.label as week_label
    FROM lineup_slots ls
    JOIN weekly_lineups wl ON wl.id = ls.lineup_id
    JOIN playoff_weeks pw ON pw.id = wl.week_id
    JOIN nfl_players np ON np.id = ls.player_id
    WHERE wl.entry_id = ?
    ORDER BY pw.week_number
  `).all(entryId);

  res.json(rows.map(r => ({
    playerId:  r.player_id,
    fullName:  r.full_name,
    position:  r.position,
    nflTeam:   r.nfl_team,
    weekLabel: r.week_label,
  })));
});

module.exports = router;
