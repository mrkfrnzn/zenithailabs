const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

/**
 * Write an audit log entry.
 *
 * @param {object} opts
 * @param {string}  opts.action      - e.g. 'lineup_submitted', 'score_calculated', 'admin_override'
 * @param {string}  [opts.actorId]   - user ID of the actor
 * @param {string}  [opts.targetType]- e.g. 'lineup', 'score', 'participant'
 * @param {string}  [opts.targetId]  - ID of the affected record
 * @param {object}  [opts.details]   - any extra JSON-serialisable context
 */
function log({ action, actorId = null, targetType = null, targetId = null, details = null }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (id, action, actor_id, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    action,
    actorId,
    targetType,
    targetId,
    details ? JSON.stringify(details) : null
  );
}

/**
 * Fetch recent audit logs (latest first).
 *
 * @param {object} [opts]
 * @param {string}  [opts.action]      - filter by action
 * @param {string}  [opts.targetType]  - filter by target type
 * @param {string}  [opts.targetId]    - filter by target ID
 * @param {number}  [opts.limit=100]
 */
function getLogs({ action, targetType, targetId, limit = 100 } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (action)     { query += ' AND action = ?';      params.push(action); }
  if (targetType) { query += ' AND target_type = ?'; params.push(targetType); }
  if (targetId)   { query += ' AND target_id = ?';   params.push(targetId); }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params).map(row => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null,
  }));
}

module.exports = { log, getLogs };
