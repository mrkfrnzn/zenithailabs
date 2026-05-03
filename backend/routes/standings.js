const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/standings/:seasonId
 * Full standings for a season.
 */
router.get('/:seasonId', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      s.rank,
      s.total_points,
      s.entry_id,
      pe.user_id,
      pe.paid,
      u.display_name,
      u.email
    FROM standings s
    JOIN participant_entries pe ON pe.id = s.entry_id
    JOIN users u ON u.id = pe.user_id
    WHERE s.season_id = ?
    ORDER BY s.rank ASC
  `).all(req.params.seasonId);

  res.json(rows.map(r => ({
    rank:        r.rank,
    totalPoints: r.total_points,
    entryId:     r.entry_id,
    userId:      r.user_id,
    displayName: r.display_name || r.email,
    paid:        r.paid === 1,
  })));
});

module.exports = router;
