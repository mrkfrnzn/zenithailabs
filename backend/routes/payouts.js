const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { computePayoutSummary } = require('../services/payoutService');

const router = express.Router();

/**
 * GET /api/payouts/:seasonId
 * Calculate payout projections for a season.
 * Query params: ?entryFee=50&paidCount=7 (optional overrides for projection)
 */
router.get('/:seasonId', requireAuth, (req, res) => {
  const db = getDb();
  const { seasonId } = req.params;

  const league = db.prepare(`
    SELECT l.entry_fee FROM seasons s JOIN leagues l ON l.id = s.league_id WHERE s.id = ?
  `).get(seasonId);

  const entryFee  = parseFloat(req.query.entryFee) || (league ? league.entry_fee : 0);
  const paidCount = parseInt(req.query.paidCount, 10) ||
    db.prepare("SELECT COUNT(*) as c FROM participant_entries WHERE season_id = ? AND paid = 1").get(seasonId).c;

  const rules = db.prepare('SELECT * FROM payout_rules WHERE season_id = ?').all(seasonId);

  const rankedEntries = db.prepare(`
    SELECT s.entry_id, s.rank, u.display_name, u.email
    FROM standings s
    JOIN participant_entries pe ON pe.id = s.entry_id
    JOIN users u ON u.id = pe.user_id
    WHERE s.season_id = ?
    ORDER BY s.rank
  `).all(seasonId);

  const summary = computePayoutSummary(entryFee, paidCount, rules, rankedEntries);

  res.json({
    entryFee,
    paidCount,
    totalPot:   summary.totalPot,
    houseCut:   summary.houseCut,
    prizePool:  summary.prizePool,
    rule:       summary.rule,
    payouts:    summary.payouts,
  });
});

module.exports = router;
