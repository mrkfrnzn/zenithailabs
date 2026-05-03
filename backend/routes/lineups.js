const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const audit = require('../services/auditService');
const { validateNoRepeatPlayers, validateLineupSlots } = require('../services/scoringEngine');

const router = express.Router();

const LOCK_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before kickoff

/**
 * Check if picks are currently locked for a given week.
 * Returns true if lock_time is set and we are within LOCK_BUFFER_MS of it.
 */
function isLocked(week) {
  if (!week.lock_time) return false;
  return new Date() >= new Date(new Date(week.lock_time).getTime() - LOCK_BUFFER_MS);
}

/**
 * GET /api/lineups/week/:weekId/entry/:entryId
 * Get a lineup for a specific entry and week.
 * Before lock: only the owner or admin may see picks.
 * After lock: everyone can see.
 */
router.get('/week/:weekId/entry/:entryId', requireAuth, (req, res) => {
  const db = getDb();
  const { weekId, entryId } = req.params;

  const week   = db.prepare('SELECT * FROM playoff_weeks WHERE id = ?').get(weekId);
  if (!week)   return res.status(404).json({ error: 'Week not found' });

  const entry  = db.prepare('SELECT * FROM participant_entries WHERE id = ?').get(entryId);
  if (!entry)  return res.status(404).json({ error: 'Entry not found' });

  const locked = isLocked(week);

  // Before lock, only the owner or admin sees picks
  if (!locked && req.user.role !== 'admin' && req.user.id !== entry.user_id) {
    return res.status(403).json({ error: 'Picks are private until the weekly lock' });
  }

  const lineup = db.prepare('SELECT * FROM weekly_lineups WHERE entry_id = ? AND week_id = ?').get(entryId, weekId);
  if (!lineup) return res.json({ lineup: null });

  const slots = db.prepare(`
    SELECT ls.slot_type, ls.player_id, np.full_name, np.position, np.nfl_team
    FROM lineup_slots ls
    JOIN nfl_players np ON np.id = ls.player_id
    WHERE ls.lineup_id = ?
  `).all(lineup.id);

  res.json({ lineup: { ...lineup, slots } });
});

/**
 * GET /api/lineups/week/:weekId
 * All lineups for a week (only visible to everyone after lock; admin always).
 */
router.get('/week/:weekId', requireAuth, (req, res) => {
  const db = getDb();
  const week = db.prepare('SELECT * FROM playoff_weeks WHERE id = ?').get(req.params.weekId);
  if (!week) return res.status(404).json({ error: 'Week not found' });

  const locked = isLocked(week);
  if (!locked && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Lineups are not visible until the weekly lock' });
  }

  const lineups = db.prepare(`
    SELECT wl.*, pe.user_id, u.display_name, u.email
    FROM weekly_lineups wl
    JOIN participant_entries pe ON pe.id = wl.entry_id
    JOIN users u ON u.id = pe.user_id
    WHERE wl.week_id = ?
  `).all(req.params.weekId);

  const result = lineups.map(lineup => {
    const slots = db.prepare(`
      SELECT ls.slot_type, ls.player_id, np.full_name, np.position, np.nfl_team
      FROM lineup_slots ls
      JOIN nfl_players np ON np.id = ls.player_id
      WHERE ls.lineup_id = ?
    `).all(lineup.id);
    return { ...lineup, slots };
  });

  res.json(result);
});

/**
 * POST /api/lineups
 * Submit a lineup for the current week.
 * Body: { weekId, entryId, slots: { QB: playerId, RB: playerId, FLEX: playerId } }
 */
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { weekId, entryId, slots } = req.body;

  if (!weekId || !entryId || !slots) {
    return res.status(400).json({ error: 'weekId, entryId, and slots are required' });
  }

  const week = db.prepare('SELECT * FROM playoff_weeks WHERE id = ?').get(weekId);
  if (!week) return res.status(404).json({ error: 'Week not found' });

  // Deadline check
  if (isLocked(week)) {
    return res.status(400).json({ error: 'Submission deadline has passed for this week' });
  }

  const entry = db.prepare('SELECT * FROM participant_entries WHERE id = ?').get(entryId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  // Ownership check (non-admin can only submit for their own entry)
  if (req.user.role !== 'admin' && req.user.id !== entry.user_id) {
    return res.status(403).json({ error: 'Cannot submit lineup for another participant' });
  }

  // Slot validation
  const slotCheck = validateLineupSlots(slots);
  if (!slotCheck.valid) {
    return res.status(400).json({ error: `Missing required slots: ${slotCheck.missing.join(', ')}` });
  }

  // Position validation
  const newPlayerIds = Object.values(slots);
  for (const [slot, playerId] of Object.entries(slots)) {
    const player = db.prepare('SELECT * FROM nfl_players WHERE id = ?').get(playerId);
    if (!player) return res.status(400).json({ error: `Player not found: ${playerId}` });
    if (slot === 'QB' && player.position !== 'QB') {
      return res.status(400).json({ error: `${player.full_name} is not a QB` });
    }
    if (slot === 'RB' && player.position !== 'RB') {
      return res.status(400).json({ error: `${player.full_name} is not a RB` });
    }
    if (slot === 'FLEX' && !['WR', 'TE'].includes(player.position)) {
      return res.status(400).json({ error: `${player.full_name} must be WR or TE for the FLEX slot` });
    }
  }

  // No-repeat player check
  const usedRows = db.prepare(`
    SELECT ls.player_id
    FROM lineup_slots ls
    JOIN weekly_lineups wl ON wl.id = ls.lineup_id
    JOIN playoff_weeks pw ON pw.id = wl.week_id
    WHERE wl.entry_id = ? AND pw.week_number < (SELECT week_number FROM playoff_weeks WHERE id = ?)
  `).all(entryId, weekId);

  const usedPlayerIds = usedRows.map(r => r.player_id);
  const repeatCheck   = validateNoRepeatPlayers(newPlayerIds, usedPlayerIds);
  if (!repeatCheck.valid) {
    const names = repeatCheck.conflicts.map(id => {
      const p = db.prepare('SELECT full_name FROM nfl_players WHERE id = ?').get(id);
      return p ? p.full_name : id;
    });
    return res.status(400).json({
      error: `Cannot reuse players from previous weeks: ${names.join(', ')}`
    });
  }

  // Upsert lineup + slots in a transaction
  const save = db.transaction(() => {
    let lineup = db.prepare('SELECT * FROM weekly_lineups WHERE entry_id = ? AND week_id = ?').get(entryId, weekId);

    if (lineup) {
      // Update existing
      db.prepare('UPDATE weekly_lineups SET updated_at = datetime(\'now\'), admin_override = 0 WHERE id = ?').run(lineup.id);
      db.prepare('DELETE FROM lineup_slots WHERE lineup_id = ?').run(lineup.id);
    } else {
      const lineupId = uuidv4();
      db.prepare('INSERT INTO weekly_lineups (id, entry_id, week_id) VALUES (?, ?, ?)').run(lineupId, entryId, weekId);
      lineup = db.prepare('SELECT * FROM weekly_lineups WHERE id = ?').get(lineupId);
    }

    for (const [slotType, playerId] of Object.entries(slots)) {
      db.prepare('INSERT INTO lineup_slots (id, lineup_id, slot_type, player_id) VALUES (?, ?, ?, ?)').run(
        uuidv4(), lineup.id, slotType, playerId
      );
    }

    return lineup;
  });

  const lineup = save();

  audit.log({
    action:     'lineup_submitted',
    actorId:    req.user.id,
    targetType: 'lineup',
    targetId:   lineup.id,
    details:    { weekId, entryId, slots },
  });

  res.json({ message: 'Lineup saved', lineupId: lineup.id });
});

/**
 * GET /api/lineups/my/:seasonId
 * All lineups submitted by the authenticated user for a season.
 */
router.get('/my/:seasonId', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare(
    'SELECT * FROM participant_entries WHERE season_id = ? AND user_id = ?'
  ).get(req.params.seasonId, req.user.id);

  if (!entry) return res.json([]);

  const lineups = db.prepare(`
    SELECT wl.*, pw.label as week_label, pw.week_number, pw.lock_time, pw.scoring_complete
    FROM weekly_lineups wl
    JOIN playoff_weeks pw ON pw.id = wl.week_id
    WHERE wl.entry_id = ?
    ORDER BY pw.week_number
  `).all(entry.id);

  const result = lineups.map(lineup => {
    const slots = db.prepare(`
      SELECT ls.slot_type, ls.player_id, np.full_name, np.position, np.nfl_team
      FROM lineup_slots ls
      JOIN nfl_players np ON np.id = ls.player_id
      WHERE ls.lineup_id = ?
    `).all(lineup.id);
    return { ...lineup, slots };
  });

  res.json(result);
});

module.exports = router;
