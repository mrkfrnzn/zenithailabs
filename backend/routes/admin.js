const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const audit = require('../services/auditService');
const { getLogs } = require('../services/auditService');

const router = express.Router();
// All routes in this file require admin
router.use(requireAuth, requireAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// SEASONS & WEEKS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/seasons  — list all seasons */
router.get('/seasons', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.*, l.name as league_name, l.entry_fee
    FROM seasons s JOIN leagues l ON l.id = s.league_id
    ORDER BY s.nfl_season DESC
  `).all();
  res.json(rows);
});

/** POST /api/admin/seasons  — create a season */
router.post('/seasons', (req, res) => {
  const db = getDb();
  const { leagueId, nflSeason } = req.body;
  if (!leagueId || !nflSeason) return res.status(400).json({ error: 'leagueId and nflSeason required' });
  const id = uuidv4();
  db.prepare('INSERT INTO seasons (id, league_id, nfl_season) VALUES (?, ?, ?)').run(id, leagueId, nflSeason);

  // Auto-seed default payout rules
  const rules = [
    { min: 1,  max: 5,  first: 90, second: 0,  third: 0,  fourth: 0,  house: 10 },
    { min: 6,  max: 10, first: 70, second: 20, third: 0,  fourth: 0,  house: 10 },
    { min: 11, max: 15, first: 60, second: 25, third: 5,  fourth: 0,  house: 10 },
    { min: 16, max: 20, first: 55, second: 25, third: 10, fourth: 0,  house: 10 },
    { min: 21, max: 30, first: 50, second: 25, third: 15, fourth: 0,  house: 10 },
    { min: 31, max: 50, first: 50, second: 20, third: 15, fourth: 5,  house: 10 },
  ];
  const insertRule = db.prepare(
    'INSERT INTO payout_rules (id,season_id,min_players,max_players,first_pct,second_pct,third_pct,fourth_pct,house_pct) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  for (const r of rules) insertRule.run(uuidv4(), id, r.min, r.max, r.first, r.second, r.third, r.fourth, r.house);

  audit.log({ action: 'season_created', actorId: req.user.id, targetType: 'season', targetId: id });
  res.status(201).json({ id });
});

/** PATCH /api/admin/seasons/:id  — update season status */
router.patch('/seasons/:id', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!['pending','active','complete'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare("UPDATE seasons SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
  audit.log({ action: 'season_updated', actorId: req.user.id, targetType: 'season', targetId: req.params.id, details: { status } });
  res.json({ ok: true });
});

/** GET /api/admin/weeks/:seasonId  — list playoff weeks */
router.get('/weeks/:seasonId', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM playoff_weeks WHERE season_id = ? ORDER BY week_number').all(req.params.seasonId);
  res.json(rows);
});

/** POST /api/admin/weeks  — create a playoff week */
router.post('/weeks', (req, res) => {
  const db = getDb();
  const { seasonId, weekNumber, label, lockTime } = req.body;
  if (!seasonId || !weekNumber || !label) return res.status(400).json({ error: 'seasonId, weekNumber, label required' });
  const id = uuidv4();
  db.prepare('INSERT INTO playoff_weeks (id, season_id, week_number, label, lock_time) VALUES (?, ?, ?, ?, ?)').run(id, seasonId, weekNumber, label, lockTime || null);
  audit.log({ action: 'week_created', actorId: req.user.id, targetType: 'playoff_week', targetId: id });
  res.status(201).json({ id });
});

/** PATCH /api/admin/weeks/:id  — update lock time or label */
router.patch('/weeks/:id', (req, res) => {
  const db = getDb();
  const { lockTime, label } = req.body;
  if (lockTime !== undefined) db.prepare("UPDATE playoff_weeks SET lock_time=?, updated_at=datetime('now') WHERE id=?").run(lockTime, req.params.id);
  if (label    !== undefined) db.prepare("UPDATE playoff_weeks SET label=?,     updated_at=datetime('now') WHERE id=?").run(label, req.params.id);
  audit.log({ action: 'week_updated', actorId: req.user.id, targetType: 'playoff_week', targetId: req.params.id, details: { lockTime, label } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTICIPANTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/participants/:seasonId */
router.get('/participants/:seasonId', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pe.*, u.email, u.display_name, u.role
    FROM participant_entries pe
    JOIN users u ON u.id = pe.user_id
    WHERE pe.season_id = ?
    ORDER BY u.display_name
  `).all(req.params.seasonId);
  res.json(rows);
});

/** PATCH /api/admin/participants/:id/paid  — mark paid/unpaid */
router.patch('/participants/:id/paid', (req, res) => {
  const db = getDb();
  const paid = req.body.paid ? 1 : 0;
  db.prepare("UPDATE participant_entries SET paid=?, updated_at=datetime('now') WHERE id=?").run(paid, req.params.id);
  audit.log({
    action: paid ? 'participant_marked_paid' : 'participant_marked_unpaid',
    actorId: req.user.id, targetType: 'participant_entry', targetId: req.params.id
  });
  res.json({ ok: true });
});

/** POST /api/admin/participants  — add a participant to a season */
router.post('/participants', (req, res) => {
  const db = getDb();
  const { seasonId, email } = req.body;
  if (!seasonId || !email) return res.status(400).json({ error: 'seasonId and email required' });

  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    const uid = uuidv4();
    db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').run(uid, email.toLowerCase(), 'player');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  }

  const exists = db.prepare('SELECT id FROM participant_entries WHERE season_id = ? AND user_id = ?').get(seasonId, user.id);
  if (exists) return res.status(409).json({ error: 'User is already a participant' });

  const id = uuidv4();
  db.prepare('INSERT INTO participant_entries (id, season_id, user_id) VALUES (?, ?, ?)').run(id, seasonId, user.id);
  audit.log({ action: 'participant_added', actorId: req.user.id, targetType: 'participant_entry', targetId: id, details: { email } });
  res.status(201).json({ id });
});

// ─────────────────────────────────────────────────────────────────────────────
// LINEUPS (view all + override)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/lineups/:weekId  — all lineups for a week */
router.get('/lineups/:weekId', (req, res) => {
  const db = getDb();
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

/** PATCH /api/admin/lineups/:lineupId  — override a lineup */
router.patch('/lineups/:lineupId', (req, res) => {
  const db = getDb();
  const { slots } = req.body; // { QB: playerId, RB: playerId, FLEX: playerId }
  if (!slots) return res.status(400).json({ error: 'slots required' });

  const lineup = db.prepare('SELECT * FROM weekly_lineups WHERE id = ?').get(req.params.lineupId);
  if (!lineup) return res.status(404).json({ error: 'Lineup not found' });

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE weekly_lineups SET admin_override=1, override_by=?, override_at=datetime('now'), updated_at=datetime('now') WHERE id=?
    `).run(req.user.id, lineup.id);
    db.prepare('DELETE FROM lineup_slots WHERE lineup_id = ?').run(lineup.id);
    for (const [slotType, playerId] of Object.entries(slots)) {
      db.prepare('INSERT INTO lineup_slots (id, lineup_id, slot_type, player_id) VALUES (?, ?, ?, ?)').run(
        uuidv4(), lineup.id, slotType, playerId
      );
    }
  });

  update();

  audit.log({
    action:     'admin_override',
    actorId:    req.user.id,
    targetType: 'lineup',
    targetId:   lineup.id,
    details:    { slots },
  });

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS — enter/update player stats
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/stats/:weekId */
router.get('/stats/:weekId', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ps.*, np.full_name, np.position, np.nfl_team
    FROM player_stats ps
    JOIN nfl_players np ON np.id = ps.player_id
    WHERE ps.week_id = ?
    ORDER BY np.position, np.full_name
  `).all(req.params.weekId);
  res.json(rows);
});

/** PUT /api/admin/stats  — upsert player stats for a week */
router.put('/stats', (req, res) => {
  const db = getDb();
  const { playerId, weekId, passingYards=0, rushingYards=0, receivingYards=0,
          passingTds=0, rushingTds=0, receivingTds=0, interceptions=0 } = req.body;
  if (!playerId || !weekId) return res.status(400).json({ error: 'playerId and weekId required' });

  const existing = db.prepare('SELECT id FROM player_stats WHERE player_id=? AND week_id=?').get(playerId, weekId);
  if (existing) {
    db.prepare(`
      UPDATE player_stats SET passing_yards=?,rushing_yards=?,receiving_yards=?,passing_tds=?,rushing_tds=?,receiving_tds=?,interceptions=?,updated_at=datetime('now') WHERE id=?
    `).run(passingYards,rushingYards,receivingYards,passingTds,rushingTds,receivingTds,interceptions,existing.id);
  } else {
    db.prepare(`
      INSERT INTO player_stats (id,player_id,week_id,passing_yards,rushing_yards,receiving_yards,passing_tds,rushing_tds,receiving_tds,interceptions,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,'manual')
    `).run(uuidv4(),playerId,weekId,passingYards,rushingYards,receivingYards,passingTds,rushingTds,receivingTds,interceptions);
  }

  audit.log({
    action: 'stats_entered', actorId: req.user.id, targetType: 'player_stats',
    details: { playerId, weekId, passingYards, rushingYards, receivingYards, passingTds, rushingTds, receivingTds, interceptions }
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUT RULES
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/payout-rules/:seasonId */
router.get('/payout-rules/:seasonId', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM payout_rules WHERE season_id = ? ORDER BY min_players').all(req.params.seasonId));
});

/** PUT /api/admin/payout-rules/:id */
router.put('/payout-rules/:id', (req, res) => {
  const db = getDb();
  const { firstPct, secondPct, thirdPct, fourthPct, housePct } = req.body;
  db.prepare(`
    UPDATE payout_rules SET first_pct=?,second_pct=?,third_pct=?,fourth_pct=?,house_pct=? WHERE id=?
  `).run(firstPct,secondPct,thirdPct,fourthPct,housePct,req.params.id);
  audit.log({ action: 'payout_rule_updated', actorId: req.user.id, targetType: 'payout_rule', targetId: req.params.id });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// USERS / ADMIN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/users */
router.get('/users', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at').all());
});

/** PATCH /api/admin/users/:id/role */
router.patch('/users/:id/role', (req, res) => {
  const db = getDb();
  const { role } = req.body;
  if (!['player','admin'].includes(role)) return res.status(400).json({ error: 'Role must be player or admin' });
  db.prepare("UPDATE users SET role=?, updated_at=datetime('now') WHERE id=?").run(role, req.params.id);
  audit.log({ action: 'user_role_changed', actorId: req.user.id, targetType: 'user', targetId: req.params.id, details: { role } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/audit-logs */
router.get('/audit-logs', (req, res) => {
  const logs = getLogs({
    action:     req.query.action     || undefined,
    targetType: req.query.targetType || undefined,
    targetId:   req.query.targetId   || undefined,
    limit:      parseInt(req.query.limit, 10) || 100,
  });
  res.json(logs);
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAGUES
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/leagues */
router.get('/leagues', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM leagues ORDER BY created_at DESC').all());
});

/** POST /api/admin/leagues */
router.post('/leagues', (req, res) => {
  const db = getDb();
  const { name, entryFee } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO leagues (id, name, entry_fee, created_by) VALUES (?, ?, ?, ?)').run(id, name, entryFee || 0, req.user.id);
  res.status(201).json({ id });
});

/** PATCH /api/admin/leagues/:id */
router.patch('/leagues/:id', (req, res) => {
  const db = getDb();
  const { name, entryFee } = req.body;
  if (name      !== undefined) db.prepare("UPDATE leagues SET name=?,      updated_at=datetime('now') WHERE id=?").run(name, req.params.id);
  if (entryFee  !== undefined) db.prepare("UPDATE leagues SET entry_fee=?, updated_at=datetime('now') WHERE id=?").run(entryFee, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
