const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { getDb }  = require('../db/database');
const { signToken } = require('../middleware/auth');
const audit = require('../services/auditService');

const router = express.Router();

const MAGIC_LINK_EXPIRES_MINUTES = parseInt(process.env.MAGIC_LINK_EXPIRES_MINUTES || '30', 10);
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Build a nodemailer transporter from env vars.
// TODO: configure your SMTP provider in .env (SMTP_HOST, SMTP_PORT, etc.)
function getMailer() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Dev fallback: log to console only
  return null;
}

/**
 * POST /api/auth/magic-link
 * Body: { email }
 * Creates a magic link token and sends (or logs) the link.
 */
router.post('/magic-link', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const db = getDb();

  // Get or create user
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    const newId = uuidv4();
    db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').run(newId, email.toLowerCase(), 'player');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId);
  }

  // Expire old tokens for this user
  db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

  // Create new token
  const token     = uuidv4();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRES_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO magic_link_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
    uuidv4(), user.id, token, expiresAt
  );

  const magicUrl = `${APP_URL}/auth/verify?token=${token}`;

  // Send email if SMTP configured, otherwise log
  const mailer = getMailer();
  if (mailer) {
    try {
      await mailer.sendMail({
        from:    process.env.SMTP_FROM || 'noreply@zenithailabs.com',
        to:      email,
        subject: 'Your NFL Survivor League login link',
        html: `
          <p>Click the link below to log in. It expires in ${MAGIC_LINK_EXPIRES_MINUTES} minutes.</p>
          <p><a href="${magicUrl}">${magicUrl}</a></p>
          <p>If you did not request this, ignore this email.</p>
        `,
      });
    } catch (err) {
      console.error('Email send failed:', err.message);
    }
  } else {
    // Dev mode: print link to server console
    console.log('\n====== MAGIC LINK (dev mode) ======');
    console.log(`Email: ${email}`);
    console.log(`Link:  ${magicUrl}`);
    console.log('===================================\n');
  }

  audit.log({ action: 'magic_link_requested', actorId: user.id, details: { email } });

  res.json({
    message: 'Magic link sent. Check your email (or server console in dev mode).',
    // Only expose link in development so tests and demos work without email
    ...(process.env.NODE_ENV !== 'production' && { devLink: magicUrl }),
  });
});

/**
 * GET /api/auth/verify?token=<token>
 * Validates the magic link token and returns a JWT.
 */
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const db = getDb();
  const record = db.prepare(`
    SELECT mlt.*, u.email, u.display_name, u.role
    FROM magic_link_tokens mlt
    JOIN users u ON u.id = mlt.user_id
    WHERE mlt.token = ? AND mlt.used = 0
  `).get(token);

  if (!record) return res.status(400).json({ error: 'Invalid or already used token' });
  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Token expired. Please request a new link.' });
  }

  // Mark token used
  db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE id = ?').run(record.id);

  const jwt = signToken({ id: record.user_id, email: record.email, role: record.role });

  audit.log({ action: 'magic_link_used', actorId: record.user_id });

  res.json({
    token:       jwt,
    user: {
      id:          record.user_id,
      email:       record.email,
      displayName: record.display_name,
      role:        record.role,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
const { requireAuth } = require('../middleware/auth');
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, displayName: user.display_name, role: user.role });
});

module.exports = router;
