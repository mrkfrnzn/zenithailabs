require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');

// Run migrate first to ensure schema exists
const { runMigration } = require('./migrate');
runMigration(require('./database').getDb());

const db = getDb();

function seed() {
  const run = db.transaction(() => {

    // ── Users ─────────────────────────────────────────────────────────────
    const adminId    = uuidv4();
    const player1Id  = uuidv4();
    const player2Id  = uuidv4();
    const player3Id  = uuidv4();
    const player4Id  = uuidv4();
    const player5Id  = uuidv4();
    const player6Id  = uuidv4();
    const player7Id  = uuidv4();

    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)
    `);
    insertUser.run(adminId,   'admin@zenithailabs.com',  'League Admin',   'admin');
    insertUser.run(player1Id, 'alice@example.com',       'Alice Johnson',  'player');
    insertUser.run(player2Id, 'bob@example.com',         'Bob Smith',      'player');
    insertUser.run(player3Id, 'charlie@example.com',     'Charlie Brown',  'player');
    insertUser.run(player4Id, 'diana@example.com',       'Diana Prince',   'player');
    insertUser.run(player5Id, 'evan@example.com',        'Evan Torres',    'player');
    insertUser.run(player6Id, 'fiona@example.com',       'Fiona Green',    'player');
    insertUser.run(player7Id, 'george@example.com',      'George Hall',    'player');

    // ── League ────────────────────────────────────────────────────────────
    const leagueId = uuidv4();
    db.prepare(`
      INSERT OR IGNORE INTO leagues (id, name, entry_fee, created_by) VALUES (?, ?, ?, ?)
    `).run(leagueId, 'Zenith NFL Playoff Survivor 2024', 50, adminId);

    // ── Season ────────────────────────────────────────────────────────────
    const seasonId = uuidv4();
    db.prepare(`
      INSERT OR IGNORE INTO seasons (id, league_id, nfl_season, status) VALUES (?, ?, ?, ?)
    `).run(seasonId, leagueId, 2024, 'active');

    // ── Playoff Weeks ─────────────────────────────────────────────────────
    const weeks = [
      { num: 1, label: 'Wild Card Week',           lock: '2025-01-11T13:25:00Z' },
      { num: 2, label: 'Divisional Round',          lock: '2025-01-18T16:25:00Z' },
      { num: 3, label: 'Conference Championships',  lock: '2025-01-26T15:25:00Z' },
      { num: 4, label: 'Super Bowl',                lock: '2025-02-09T18:25:00Z' },
    ];
    const weekIds = [];
    const insertWeek = db.prepare(`
      INSERT OR IGNORE INTO playoff_weeks (id, season_id, week_number, label, lock_time, scoring_complete)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const w of weeks) {
      const id = uuidv4();
      weekIds.push({ id, ...w });
      insertWeek.run(id, seasonId, w.num, w.label, w.lock, w.num <= 2 ? 1 : 0);
    }

    // ── NFL Players ───────────────────────────────────────────────────────
    const players = [
      // QBs
      { name: 'Patrick Mahomes',  pos: 'QB', team: 'KC'  },
      { name: 'Josh Allen',       pos: 'QB', team: 'BUF' },
      { name: 'Lamar Jackson',    pos: 'QB', team: 'BAL' },
      { name: 'Joe Burrow',       pos: 'QB', team: 'CIN' },
      { name: 'Jared Goff',       pos: 'QB', team: 'DET' },
      { name: 'Brock Purdy',      pos: 'QB', team: 'SF'  },
      { name: 'Dak Prescott',     pos: 'QB', team: 'DAL' },
      { name: 'Sam Darnold',      pos: 'QB', team: 'MIN' },
      // RBs
      { name: 'Derrick Henry',    pos: 'RB', team: 'BAL' },
      { name: 'Saquon Barkley',   pos: 'RB', team: 'PHI' },
      { name: 'Christian McCaffrey', pos: 'RB', team: 'SF' },
      { name: 'James Cook',       pos: 'RB', team: 'BUF' },
      { name: 'Tony Pollard',     pos: 'RB', team: 'TEN' },
      { name: 'Isiah Pacheco',    pos: 'RB', team: 'KC'  },
      { name: 'David Montgomery', pos: 'RB', team: 'DET' },
      { name: 'De\'Von Achane',   pos: 'RB', team: 'MIA' },
      // WRs
      { name: 'Tyreek Hill',      pos: 'WR', team: 'MIA' },
      { name: 'Davante Adams',    pos: 'WR', team: 'LV'  },
      { name: 'Justin Jefferson', pos: 'WR', team: 'MIN' },
      { name: 'CeeDee Lamb',      pos: 'WR', team: 'DAL' },
      { name: 'Puka Nacua',       pos: 'WR', team: 'LAR' },
      { name: 'Amon-Ra St. Brown',pos: 'WR', team: 'DET' },
      { name: 'Stefon Diggs',     pos: 'WR', team: 'BUF' },
      { name: 'Jamarr Chase',     pos: 'WR', team: 'CIN' },
      // TEs
      { name: 'Travis Kelce',     pos: 'TE', team: 'KC'  },
      { name: 'Sam LaPorta',      pos: 'TE', team: 'DET' },
      { name: 'Trey McBride',     pos: 'TE', team: 'ARI' },
      { name: 'T.J. Hockenson',   pos: 'TE', team: 'MIN' },
    ];
    const playerIdMap = {};
    const insertPlayer = db.prepare(`
      INSERT OR IGNORE INTO nfl_players (id, full_name, position, nfl_team, external_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of players) {
      const id = uuidv4();
      playerIdMap[p.name] = id;
      insertPlayer.run(id, p.name, p.pos, p.team, `mock_${p.team}_${p.name.replace(/\s/g, '_').toLowerCase()}`);
    }

    // ── Participant Entries ───────────────────────────────────────────────
    const participantUsers = [player1Id, player2Id, player3Id, player4Id, player5Id, player6Id, player7Id];
    const entryIds = [];
    const insertEntry = db.prepare(`
      INSERT OR IGNORE INTO participant_entries (id, season_id, user_id, paid)
      VALUES (?, ?, ?, ?)
    `);
    for (let i = 0; i < participantUsers.length; i++) {
      const id = uuidv4();
      entryIds.push(id);
      insertEntry.run(id, seasonId, participantUsers[i], i < 5 ? 1 : 0); // first 5 paid
    }

    // ── Payout Rules ──────────────────────────────────────────────────────
    const payoutRules = [
      { min: 1,  max: 5,  first: 90, second: 0,  third: 0,  fourth: 0,  house: 10 },
      { min: 6,  max: 10, first: 70, second: 20, third: 0,  fourth: 0,  house: 10 },
      { min: 11, max: 15, first: 60, second: 25, third: 5,  fourth: 0,  house: 10 },
      { min: 16, max: 20, first: 55, second: 25, third: 10, fourth: 0,  house: 10 },
      { min: 21, max: 30, first: 50, second: 25, third: 15, fourth: 0,  house: 10 },
      { min: 31, max: 50, first: 50, second: 20, third: 15, fourth: 5,  house: 10 },
    ];
    const insertRule = db.prepare(`
      INSERT OR IGNORE INTO payout_rules
        (id, season_id, min_players, max_players, first_pct, second_pct, third_pct, fourth_pct, house_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of payoutRules) {
      insertRule.run(uuidv4(), seasonId, r.min, r.max, r.first, r.second, r.third, r.fourth, r.house);
    }

    // ── Sample Weekly Lineups (Week 1 & 2 for all players) ────────────────
    const week1 = weekIds.find(w => w.num === 1);
    const week2 = weekIds.find(w => w.num === 2);

    // Week 1 picks per player
    const week1Picks = [
      { entry: entryIds[0], qb: 'Patrick Mahomes',    rb: 'Derrick Henry',       flex: 'Travis Kelce'        },
      { entry: entryIds[1], qb: 'Josh Allen',         rb: 'James Cook',          flex: 'Stefon Diggs'        },
      { entry: entryIds[2], qb: 'Lamar Jackson',      rb: 'Derrick Henry',       flex: 'T.J. Hockenson'      },
      { entry: entryIds[3], qb: 'Joe Burrow',         rb: 'Saquon Barkley',      flex: 'Jamarr Chase'        },
      { entry: entryIds[4], qb: 'Jared Goff',         rb: 'David Montgomery',    flex: 'Amon-Ra St. Brown'   },
      { entry: entryIds[5], qb: 'Brock Purdy',        rb: 'Christian McCaffrey', flex: 'Tyreek Hill'         },
      { entry: entryIds[6], qb: 'Sam Darnold',        rb: 'De\'Von Achane',      flex: 'Justin Jefferson'    },
    ];

    // Week 2 picks per player (must not reuse week 1 players)
    const week2Picks = [
      { entry: entryIds[0], qb: 'Josh Allen',         rb: 'Isiah Pacheco',       flex: 'Justin Jefferson'    },
      { entry: entryIds[1], qb: 'Lamar Jackson',      rb: 'Derrick Henry',       flex: 'T.J. Hockenson'      },
      { entry: entryIds[2], qb: 'Patrick Mahomes',    rb: 'Saquon Barkley',      flex: 'Travis Kelce'        },
      { entry: entryIds[3], qb: 'Jared Goff',         rb: 'David Montgomery',    flex: 'Amon-Ra St. Brown'   },
      { entry: entryIds[4], qb: 'Josh Allen',         rb: 'James Cook',          flex: 'Stefon Diggs'        },
      { entry: entryIds[5], qb: 'Lamar Jackson',      rb: 'Isiah Pacheco',       flex: 'Travis Kelce'        },
      { entry: entryIds[6], qb: 'Patrick Mahomes',    rb: 'Christian McCaffrey', flex: 'CeeDee Lamb'         },
    ];

    const insertLineup = db.prepare(`
      INSERT OR IGNORE INTO weekly_lineups (id, entry_id, week_id, submitted_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertSlot = db.prepare(`
      INSERT OR IGNORE INTO lineup_slots (id, lineup_id, slot_type, player_id)
      VALUES (?, ?, ?, ?)
    `);

    function seedWeekPicks(picks, weekId, submittedAt) {
      for (const pick of picks) {
        const lineupId = uuidv4();
        insertLineup.run(lineupId, pick.entry, weekId, submittedAt);
        insertSlot.run(uuidv4(), lineupId, 'QB',   playerIdMap[pick.qb]);
        insertSlot.run(uuidv4(), lineupId, 'RB',   playerIdMap[pick.rb]);
        insertSlot.run(uuidv4(), lineupId, 'FLEX', playerIdMap[pick.flex]);
      }
    }

    seedWeekPicks(week1Picks, week1.id, '2025-01-11T13:00:00Z');
    seedWeekPicks(week2Picks, week2.id, '2025-01-18T16:00:00Z');

    // ── Player Stats (Weeks 1 & 2) ────────────────────────────────────────
    const statsData = [
      // Week 1
      { player: 'Patrick Mahomes',    week: 1, pass_yds: 262, rush_yds: 24, rec_yds: 0,   pass_td: 2, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Josh Allen',         week: 1, pass_yds: 181, rush_yds: 52, rec_yds: 0,   pass_td: 1, rush_td: 1, rec_td: 0, int: 1 },
      { player: 'Lamar Jackson',      week: 1, pass_yds: 272, rush_yds: 38, rec_yds: 0,   pass_td: 3, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'Joe Burrow',         week: 1, pass_yds: 296, rush_yds: 5,  rec_yds: 0,   pass_td: 2, rush_td: 0, rec_td: 0, int: 1 },
      { player: 'Jared Goff',         week: 1, pass_yds: 315, rush_yds: 8,  rec_yds: 0,   pass_td: 2, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'Brock Purdy',        week: 1, pass_yds: 220, rush_yds: 15, rec_yds: 0,   pass_td: 1, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'Sam Darnold',        week: 1, pass_yds: 142, rush_yds: 10, rec_yds: 0,   pass_td: 1, rush_td: 0, rec_td: 0, int: 2 },
      { player: 'Derrick Henry',      week: 1, pass_yds: 0,   rush_yds: 140,rec_yds: 15,  pass_td: 0, rush_td: 2, rec_td: 0, int: 0 },
      { player: 'James Cook',         week: 1, pass_yds: 0,   rush_yds: 98, rec_yds: 22,  pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'David Montgomery',   week: 1, pass_yds: 0,   rush_yds: 86, rec_yds: 12,  pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Saquon Barkley',     week: 1, pass_yds: 0,   rush_yds: 125,rec_yds: 20,  pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Christian McCaffrey',week: 1, pass_yds: 0,   rush_yds: 107,rec_yds: 31,  pass_td: 0, rush_td: 1, rec_td: 1, int: 0 },
      { player: "De'Von Achane",      week: 1, pass_yds: 0,   rush_yds: 68, rec_yds: 44,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Isiah Pacheco',      week: 1, pass_yds: 0,   rush_yds: 72, rec_yds: 8,   pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Travis Kelce',       week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 58,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Stefon Diggs',       week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 75,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Amon-Ra St. Brown',  week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 90,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Justin Jefferson',   week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 62,  pass_td: 0, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'T.J. Hockenson',     week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 44,  pass_td: 0, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'Jamarr Chase',       week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 82,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Tyreek Hill',        week: 1, pass_yds: 0,   rush_yds: 0,  rec_yds: 94,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      // Week 2
      { player: 'Patrick Mahomes',    week: 2, pass_yds: 308, rush_yds: 18, rec_yds: 0,   pass_td: 3, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'Josh Allen',         week: 2, pass_yds: 258, rush_yds: 40, rec_yds: 0,   pass_td: 2, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Lamar Jackson',      week: 2, pass_yds: 290, rush_yds: 55, rec_yds: 0,   pass_td: 3, rush_td: 1, rec_td: 0, int: 1 },
      { player: 'Jared Goff',         week: 2, pass_yds: 280, rush_yds: 5,  rec_yds: 0,   pass_td: 2, rush_td: 0, rec_td: 0, int: 1 },
      { player: 'Derrick Henry',      week: 2, pass_yds: 0,   rush_yds: 155,rec_yds: 12,  pass_td: 0, rush_td: 2, rec_td: 0, int: 0 },
      { player: 'Saquon Barkley',     week: 2, pass_yds: 0,   rush_yds: 118,rec_yds: 28,  pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'James Cook',         week: 2, pass_yds: 0,   rush_yds: 78, rec_yds: 15,  pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'David Montgomery',   week: 2, pass_yds: 0,   rush_yds: 92, rec_yds: 8,   pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Christian McCaffrey',week: 2, pass_yds: 0,   rush_yds: 90, rec_yds: 40,  pass_td: 0, rush_td: 1, rec_td: 0, int: 0 },
      { player: 'Isiah Pacheco',      week: 2, pass_yds: 0,   rush_yds: 65, rec_yds: 10,  pass_td: 0, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'Travis Kelce',       week: 2, pass_yds: 0,   rush_yds: 0,  rec_yds: 71,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Justin Jefferson',   week: 2, pass_yds: 0,   rush_yds: 0,  rec_yds: 88,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'T.J. Hockenson',     week: 2, pass_yds: 0,   rush_yds: 0,  rec_yds: 60,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Amon-Ra St. Brown',  week: 2, pass_yds: 0,   rush_yds: 0,  rec_yds: 78,  pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
      { player: 'Stefon Diggs',       week: 2, pass_yds: 0,   rush_yds: 0,  rec_yds: 55,  pass_td: 0, rush_td: 0, rec_td: 0, int: 0 },
      { player: 'CeeDee Lamb',        week: 2, pass_yds: 0,   rush_yds: 0,  rec_yds: 102, pass_td: 0, rush_td: 0, rec_td: 1, int: 0 },
    ];

    const insertStat = db.prepare(`
      INSERT OR IGNORE INTO player_stats
        (id, player_id, week_id, passing_yards, rushing_yards, receiving_yards,
         passing_tds, rushing_tds, receiving_tds, interceptions, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of statsData) {
      const playerId = playerIdMap[s.player];
      const weekEntry = weekIds.find(w => w.num === s.week);
      if (!playerId || !weekEntry) continue;
      insertStat.run(
        uuidv4(), playerId, weekEntry.id,
        s.pass_yds, s.rush_yds, s.rec_yds,
        s.pass_td, s.rush_td, s.rec_td,
        s.int, 'mock'
      );
    }

    // ── NFL Games ─────────────────────────────────────────────────────────
    const games = [
      // Week 1 Wild Card
      { week: 1, home: 'KC',  away: 'MIA', kickoff: '2025-01-11T21:00:00Z' },
      { week: 1, home: 'BUF', away: 'PIT', kickoff: '2025-01-12T18:00:00Z' },
      { week: 1, home: 'BAL', away: 'HOU', kickoff: '2025-01-12T21:30:00Z' },
      { week: 1, home: 'DET', away: 'LAR', kickoff: '2025-01-13T18:00:00Z' },
      { week: 1, home: 'PHI', away: 'GB',  kickoff: '2025-01-13T21:30:00Z' },
      { week: 1, home: 'MIN', away: 'LAC', kickoff: '2025-01-11T18:00:00Z' },
      // Week 2 Divisional
      { week: 2, home: 'KC',  away: 'HOU', kickoff: '2025-01-18T21:30:00Z' },
      { week: 2, home: 'BUF', away: 'BAL', kickoff: '2025-01-19T18:00:00Z' },
      { week: 2, home: 'DET', away: 'LAR', kickoff: '2025-01-18T18:00:00Z' },
      { week: 2, home: 'PHI', away: 'LAR', kickoff: '2025-01-19T21:30:00Z' },
    ];
    const insertGame = db.prepare(`
      INSERT OR IGNORE INTO nfl_games (id, week_id, home_team, away_team, kickoff_time)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const g of games) {
      const weekEntry = weekIds.find(w => w.num === g.week);
      if (!weekEntry) continue;
      insertGame.run(uuidv4(), weekEntry.id, g.home, g.away, g.kickoff);
    }

    console.log('Seed complete.');
    console.log('');
    console.log('Demo accounts:');
    console.log('  Admin:   admin@zenithailabs.com');
    console.log('  Players: alice@example.com, bob@example.com, charlie@example.com,');
    console.log('           diana@example.com, evan@example.com, fiona@example.com, george@example.com');
    console.log('');
    console.log('Use magic link login — no passwords required.');
    console.log('In dev mode the magic link URL is printed to the server console.');
  });

  run();
}

seed();
