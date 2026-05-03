require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const authRoutes      = require('./routes/auth');
const playerRoutes    = require('./routes/players');
const lineupRoutes    = require('./routes/lineups');
const scoreRoutes     = require('./routes/scores');
const standingRoutes  = require('./routes/standings');
const payoutRoutes    = require('./routes/payouts');
const adminRoutes     = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/auth/magic-link', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/players',   playerRoutes);
app.use('/api/lineups',   lineupRoutes);
app.use('/api/scores',    scoreRoutes);
app.use('/api/standings', standingRoutes);
app.use('/api/payouts',   payoutRoutes);
app.use('/api/admin',     adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Season / week info (public-ish, requires auth) ────────────────────────────
const { requireAuth } = require('./middleware/auth');
app.get('/api/seasons', requireAuth, (req, res) => {
  const { getDb } = require('./db/database');
  const db = getDb();
  const seasons = db.prepare(`
    SELECT s.*, l.name as league_name, l.entry_fee
    FROM seasons s JOIN leagues l ON l.id = s.league_id
    ORDER BY s.nfl_season DESC
  `).all();
  res.json(seasons);
});

app.get('/api/seasons/:seasonId/weeks', requireAuth, (req, res) => {
  const { getDb } = require('./db/database');
  const db = getDb();
  const weeks = db.prepare('SELECT * FROM playoff_weeks WHERE season_id = ? ORDER BY week_number').all(req.params.seasonId);
  res.json(weeks);
});

app.get('/api/seasons/:seasonId/my-entry', requireAuth, (req, res) => {
  const { getDb } = require('./db/database');
  const db = getDb();
  const entry = db.prepare('SELECT * FROM participant_entries WHERE season_id = ? AND user_id = ?').get(req.params.seasonId, req.user.id);
  res.json(entry || null);
});

// ── Serve React build in production ──────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NFL Survivor API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app; // for tests
