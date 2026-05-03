/**
 * Integration tests for lineup submission rules using supertest.
 */

process.env.DATABASE_PATH  = ':memory:';
process.env.JWT_SECRET     = 'test_secret';
process.env.NODE_ENV       = 'test';

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

let app;
let db;
let adminToken;
let playerToken;
let seasonId, week1Id, week2Id, entryId;
let qbId, rbId, wrId, teId, rb2Id;

beforeAll(() => {
  // Bootstrap app
  app = require('../server');
  const { getDb } = require('../db/database');
  db = getDb();

  // Schema
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.exec(schema); // exec handles multi-statement SQL + PRAGMAs natively

  // Seed minimal data
  const { signToken } = require('../middleware/auth');

  const adminId  = uuidv4();
  const playerId = uuidv4();
  db.prepare('INSERT INTO users (id,email,role) VALUES (?,?,?)').run(adminId,  'admin@test.com', 'admin');
  db.prepare('INSERT INTO users (id,email,role) VALUES (?,?,?)').run(playerId, 'player@test.com','player');

  adminToken  = signToken({ id: adminId,  email: 'admin@test.com',  role: 'admin'  });
  playerToken = signToken({ id: playerId, email: 'player@test.com', role: 'player' });

  const leagueId = uuidv4();
  db.prepare('INSERT INTO leagues (id,name,entry_fee,created_by) VALUES (?,?,?,?)').run(leagueId,'Test League',50,adminId);

  seasonId = uuidv4();
  db.prepare('INSERT INTO seasons (id,league_id,nfl_season,status) VALUES (?,?,?,?)').run(seasonId,leagueId,2024,'active');

  week1Id = uuidv4();
  week2Id = uuidv4();
  // Week 1: lock time in the future (open)
  const futurelock = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // Week 2: also open
  db.prepare('INSERT INTO playoff_weeks (id,season_id,week_number,label,lock_time) VALUES (?,?,?,?,?)').run(week1Id,seasonId,1,'Wild Card',futurelock);
  db.prepare('INSERT INTO playoff_weeks (id,season_id,week_number,label,lock_time) VALUES (?,?,?,?,?)').run(week2Id,seasonId,2,'Divisional',futurelock);

  // Players
  qbId  = uuidv4(); rbId  = uuidv4(); wrId  = uuidv4(); teId  = uuidv4(); rb2Id = uuidv4();
  db.prepare('INSERT INTO nfl_players (id,full_name,position,nfl_team) VALUES (?,?,?,?)').run(qbId, 'Test QB',  'QB', 'A');
  db.prepare('INSERT INTO nfl_players (id,full_name,position,nfl_team) VALUES (?,?,?,?)').run(rbId, 'Test RB',  'RB', 'A');
  db.prepare('INSERT INTO nfl_players (id,full_name,position,nfl_team) VALUES (?,?,?,?)').run(wrId, 'Test WR',  'WR', 'A');
  db.prepare('INSERT INTO nfl_players (id,full_name,position,nfl_team) VALUES (?,?,?,?)').run(teId, 'Test TE',  'TE', 'A');
  db.prepare('INSERT INTO nfl_players (id,full_name,position,nfl_team) VALUES (?,?,?,?)').run(rb2Id,'Test RB2', 'RB', 'B');

  entryId = uuidv4();
  db.prepare('INSERT INTO participant_entries (id,season_id,user_id,paid) VALUES (?,?,?,?)').run(entryId,seasonId,playerId,1);
});

describe('Lineup submission rules', () => {
  test('valid lineup is accepted', async () => {
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week1Id, entryId, slots: { QB: qbId, RB: rbId, FLEX: wrId } });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/saved/i);
  });

  test('incomplete lineup (missing FLEX) is rejected', async () => {
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week1Id, entryId, slots: { QB: qbId, RB: rbId, FLEX: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('wrong position in QB slot is rejected', async () => {
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week1Id, entryId, slots: { QB: rbId, RB: rb2Id, FLEX: wrId } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a QB/i);
  });

  test('WR in RB slot is rejected', async () => {
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week1Id, entryId, slots: { QB: qbId, RB: wrId, FLEX: teId } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a RB/i);
  });

  test('QB in FLEX slot is rejected', async () => {
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week1Id, entryId, slots: { QB: qbId, RB: rbId, FLEX: qbId } });
    // Either duplicate or wrong position error
    expect(res.status).toBe(400);
  });

  test('repeat player from prior week is rejected', async () => {
    // Week 1 lineup with QB = qbId was already submitted above
    // Now try to use qbId in week 2
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week2Id, entryId, slots: { QB: qbId, RB: rb2Id, FLEX: teId } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reuse/i);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/lineups')
      .send({ weekId: week1Id, entryId, slots: { QB: qbId, RB: rbId, FLEX: wrId } });
    expect(res.status).toBe(401);
  });

  test('player cannot submit for another entry', async () => {
    const otherUserId  = uuidv4();
    const otherEntryId = uuidv4();
    db.prepare('INSERT INTO users (id,email,role) VALUES (?,?,?)').run(otherUserId, 'other@test.com', 'player');
    db.prepare('INSERT INTO participant_entries (id,season_id,user_id,paid) VALUES (?,?,?,?)').run(
      otherEntryId, seasonId, otherUserId, 0
    );
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: week1Id, entryId: otherEntryId, slots: { QB: qbId, RB: rbId, FLEX: wrId } });
    expect(res.status).toBe(403);
  });
});

describe('Lock deadline enforcement', () => {
  test('submission after lock time is rejected', async () => {
    const lockedWeekId = uuidv4();
    const pastLock = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    db.prepare('INSERT INTO playoff_weeks (id,season_id,week_number,label,lock_time) VALUES (?,?,?,?,?)').run(
      lockedWeekId, seasonId, 99, 'Locked Week', pastLock
    );
    const res = await request(app)
      .post('/api/lineups')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ weekId: lockedWeekId, entryId, slots: { QB: qbId, RB: rbId, FLEX: wrId } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deadline/i);
  });
});

describe('Admin access control', () => {
  test('admin can access /api/admin/seasons', async () => {
    const res = await request(app)
      .get('/api/admin/seasons')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('non-admin cannot access /api/admin/seasons', async () => {
    const res = await request(app)
      .get('/api/admin/seasons')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated cannot access admin routes', async () => {
    const res = await request(app).get('/api/admin/seasons');
    expect(res.status).toBe(401);
  });
});
