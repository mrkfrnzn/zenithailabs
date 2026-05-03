const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { calcPlayerPoints, calcLineupScore } = require('../services/scoringEngine');
const audit = require('../services/auditService');

const router = express.Router();

/**
 * POST /api/scores/calculate/:weekId
 * Admin only. Runs the scoring engine for all lineups in a week.
 */
router.post('/calculate/:weekId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { weekId } = req.params;

  const week = db.prepare('SELECT * FROM playoff_weeks WHERE id = ?').get(weekId);
  if (!week) return res.status(404).json({ error: 'Week not found' });

  // Fetch all stats for this week, keyed by player_id
  const statsRows = db.prepare('SELECT * FROM player_stats WHERE week_id = ?').all(weekId);
  const statsMap  = {};
  for (const s of statsRows) statsMap[s.player_id] = s;

  // Fetch all lineups for this week
  const lineups = db.prepare(`
    SELECT wl.id, wl.entry_id, wl.week_id FROM weekly_lineups wl WHERE wl.week_id = ?
  `).all(weekId);

  const results = [];

  const calcAll = db.transaction(() => {
    for (const lineup of lineups) {
      const slots = db.prepare(`
        SELECT slot_type, player_id FROM lineup_slots WHERE lineup_id = ?
      `).all(lineup.id);

      const slotStats = {};
      for (const slot of slots) {
        const s = statsMap[slot.player_id];
        if (!s) continue;

        const player = db.prepare('SELECT position FROM nfl_players WHERE id = ?').get(slot.player_id);
        slotStats[slot.slot_type] = {
          passingYards:   s.passing_yards,
          rushingYards:   s.rushing_yards,
          receivingYards: s.receiving_yards,
          passingTds:     s.passing_tds,
          rushingTds:     s.rushing_tds,
          receivingTds:   s.receiving_tds,
          interceptions:  s.interceptions,
          position:       player ? player.position : 'UNKNOWN',
        };
      }

      const { totalPoints, slots: slotResults } = calcLineupScore(slotStats);

      const qbPoints   = slotResults['QB']   ? slotResults['QB'].points   : 0;
      const rbPoints   = slotResults['RB']   ? slotResults['RB'].points   : 0;
      const flexPoints = slotResults['FLEX'] ? slotResults['FLEX'].points : 0;

      // Upsert weekly_scores
      const existing = db.prepare('SELECT id FROM weekly_scores WHERE lineup_id = ?').get(lineup.id);
      if (existing) {
        db.prepare(`
          UPDATE weekly_scores SET qb_points=?, rb_points=?, flex_points=?, total_points=?, calculated_at=datetime('now')
          WHERE id=?
        `).run(qbPoints, rbPoints, flexPoints, totalPoints, existing.id);
      } else {
        db.prepare(`
          INSERT INTO weekly_scores (id, lineup_id, entry_id, week_id, qb_points, rb_points, flex_points, total_points)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), lineup.id, lineup.entry_id, weekId, qbPoints, rbPoints, flexPoints, totalPoints);
      }

      results.push({ entryId: lineup.entry_id, totalPoints, slotResults });
    }

    // Mark week scoring complete
    db.prepare("UPDATE playoff_weeks SET scoring_complete = 1, updated_at = datetime('now') WHERE id = ?").run(weekId);

    // Recalculate standings for this season
    const season = db.prepare('SELECT season_id FROM playoff_weeks WHERE id = ?').get(weekId);
    if (season) recalcStandings(db, season.season_id);
  });

  calcAll();

  audit.log({
    action:     'score_calculated',
    actorId:    req.user.id,
    targetType: 'week',
    targetId:   weekId,
    details:    { lineupCount: lineups.length },
  });

  res.json({ message: `Scores calculated for ${lineups.length} lineups`, results });
});

/**
 * GET /api/scores/week/:weekId
 * All scores for a week (only after scoring is complete).
 */
router.get('/week/:weekId', requireAuth, (req, res) => {
  const db = getDb();
  const week = db.prepare('SELECT * FROM playoff_weeks WHERE id = ?').get(req.params.weekId);
  if (!week) return res.status(404).json({ error: 'Week not found' });

  const rows = db.prepare(`
    SELECT ws.*, u.display_name, u.email
    FROM weekly_scores ws
    JOIN participant_entries pe ON pe.id = ws.entry_id
    JOIN users u ON u.id = pe.user_id
    WHERE ws.week_id = ?
    ORDER BY ws.total_points DESC
  `).all(req.params.weekId);

  res.json(rows);
});

/**
 * GET /api/scores/entry/:entryId
 * All weekly scores for an entry (cumulative).
 */
router.get('/entry/:entryId', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ws.*, pw.label as week_label, pw.week_number
    FROM weekly_scores ws
    JOIN playoff_weeks pw ON pw.id = ws.week_id
    WHERE ws.entry_id = ?
    ORDER BY pw.week_number
  `).all(req.params.entryId);

  const total = rows.reduce((sum, r) => sum + r.total_points, 0);
  res.json({ scores: rows, totalPoints: total });
});

function recalcStandings(db, seasonId) {
  const entries = db.prepare(`
    SELECT pe.id as entry_id, COALESCE(SUM(ws.total_points), 0) as total_points
    FROM participant_entries pe
    LEFT JOIN weekly_scores ws ON ws.entry_id = pe.id
    WHERE pe.season_id = ?
    GROUP BY pe.id
    ORDER BY total_points DESC
  `).all(seasonId);

  for (let i = 0; i < entries.length; i++) {
    const rank = i + 1;
    const existing = db.prepare('SELECT id FROM standings WHERE entry_id = ? AND season_id = ?').get(entries[i].entry_id, seasonId);
    if (existing) {
      db.prepare("UPDATE standings SET total_points=?, rank=?, updated_at=datetime('now') WHERE id=?").run(
        entries[i].total_points, rank, existing.id
      );
    } else {
      db.prepare('INSERT INTO standings (id, season_id, entry_id, total_points, rank) VALUES (?, ?, ?, ?, ?)').run(
        uuidv4(), seasonId, entries[i].entry_id, entries[i].total_points, rank
      );
    }
  }
}

module.exports = router;
