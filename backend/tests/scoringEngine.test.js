const {
  calcPlayerPoints,
  calcLineupScore,
  rankStandings,
  validateNoRepeatPlayers,
  validateLineupSlots,
} = require('../services/scoringEngine');

// ── calcPlayerPoints ──────────────────────────────────────────────────────────

describe('calcPlayerPoints', () => {
  test('scores yards at 1 pt each', () => {
    const { points } = calcPlayerPoints({ passingYards: 300, rushingYards: 0, receivingYards: 0,
      passingTds: 0, rushingTds: 0, receivingTds: 0, interceptions: 0 });
    expect(points).toBe(300);
  });

  test('TD scores 25 pts', () => {
    const { points } = calcPlayerPoints({ passingYards: 0, rushingYards: 0, receivingYards: 0,
      passingTds: 1, rushingTds: 0, receivingTds: 0, interceptions: 0 });
    expect(points).toBe(25);
  });

  test('INT subtracts 25 pts', () => {
    const { points } = calcPlayerPoints({ passingYards: 0, rushingYards: 0, receivingYards: 0,
      passingTds: 0, rushingTds: 0, receivingTds: 0, interceptions: 1 });
    expect(points).toBe(-25);
  });

  test('QB rushing yards are positive (not penalised)', () => {
    // The rule: no negative points for QB rushing yards
    // Rushing yards always add +1 per yard
    const { points, breakdown } = calcPlayerPoints({ passingYards: 0, rushingYards: 50, receivingYards: 0,
      passingTds: 0, rushingTds: 0, receivingTds: 0, interceptions: 0, position: 'QB' });
    expect(breakdown.rushingYards).toBe(50);
    expect(points).toBe(50); // positive
  });

  test('complex stat line', () => {
    // 300 pass yds + 20 rush yds + 2 pass TDs + 1 INT
    // = 320 + 50 - 25 = 345
    const { points } = calcPlayerPoints({
      passingYards: 300, rushingYards: 20, receivingYards: 0,
      passingTds: 2, rushingTds: 0, receivingTds: 0, interceptions: 1,
    });
    expect(points).toBe(345);
  });

  test('WR receiving stats', () => {
    // 100 rec yds + 1 rec TD = 100 + 25 = 125
    const { points } = calcPlayerPoints({
      passingYards: 0, rushingYards: 0, receivingYards: 100,
      passingTds: 0, rushingTds: 0, receivingTds: 1, interceptions: 0,
    });
    expect(points).toBe(125);
  });

  test('zero stats give zero points', () => {
    const { points } = calcPlayerPoints({
      passingYards: 0, rushingYards: 0, receivingYards: 0,
      passingTds: 0, rushingTds: 0, receivingTds: 0, interceptions: 0,
    });
    expect(points).toBe(0);
  });

  test('multiple TDs stack correctly', () => {
    const { points } = calcPlayerPoints({
      passingYards: 0, rushingYards: 0, receivingYards: 0,
      passingTds: 3, rushingTds: 1, receivingTds: 0, interceptions: 0,
    });
    expect(points).toBe(100); // 4 × 25
  });
});

// ── calcLineupScore ───────────────────────────────────────────────────────────

describe('calcLineupScore', () => {
  test('sums all slot points', () => {
    const slotStats = {
      QB: { passingYards: 300, rushingYards: 10, receivingYards: 0, passingTds: 2, rushingTds: 0, receivingTds: 0, interceptions: 0 },
      RB: { passingYards: 0, rushingYards: 100, receivingYards: 15, passingTds: 0, rushingTds: 1, receivingTds: 0, interceptions: 0 },
      FLEX: { passingYards: 0, rushingYards: 0, receivingYards: 75, passingTds: 0, rushingTds: 0, receivingTds: 1, interceptions: 0 },
    };
    const { totalPoints, slots } = calcLineupScore(slotStats);
    // QB: 310 + 50 = 360
    // RB: 115 + 25 = 140
    // FLEX: 75 + 25 = 100
    expect(slots.QB.points).toBe(360);
    expect(slots.RB.points).toBe(140);
    expect(slots.FLEX.points).toBe(100);
    expect(totalPoints).toBe(600);
  });

  test('handles missing slot gracefully', () => {
    const { totalPoints } = calcLineupScore({
      QB: { passingYards: 200, rushingYards: 0, receivingYards: 0, passingTds: 0, rushingTds: 0, receivingTds: 0, interceptions: 0 },
    });
    expect(totalPoints).toBe(200);
  });
});

// ── rankStandings ─────────────────────────────────────────────────────────────

describe('rankStandings', () => {
  test('ranks by total_points descending', () => {
    const entries = [
      { entry_id: 'a', total_points: 300 },
      { entry_id: 'b', total_points: 500 },
      { entry_id: 'c', total_points: 400 },
    ];
    const ranked = rankStandings(entries);
    expect(ranked[0]).toMatchObject({ entry_id: 'b', rank: 1 });
    expect(ranked[1]).toMatchObject({ entry_id: 'c', rank: 2 });
    expect(ranked[2]).toMatchObject({ entry_id: 'a', rank: 3 });
  });

  test('tie-breaks deterministically by entry_id alphabetically', () => {
    const entries = [
      { entry_id: 'zzz', total_points: 300 },
      { entry_id: 'aaa', total_points: 300 },
    ];
    const ranked = rankStandings(entries);
    expect(ranked[0].entry_id).toBe('aaa');
    expect(ranked[1].entry_id).toBe('zzz');
  });

  test('single entry ranked 1', () => {
    const ranked = rankStandings([{ entry_id: 'solo', total_points: 999 }]);
    expect(ranked[0].rank).toBe(1);
  });
});

// ── validateNoRepeatPlayers ───────────────────────────────────────────────────

describe('validateNoRepeatPlayers', () => {
  test('allows new players not previously used', () => {
    const result = validateNoRepeatPlayers(['p1', 'p2', 'p3'], ['p4', 'p5']);
    expect(result.valid).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  test('rejects player used in a prior week', () => {
    const result = validateNoRepeatPlayers(['p1', 'p2', 'p3'], ['p2', 'p5']);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toContain('p2');
  });

  test('rejects multiple conflicts', () => {
    const result = validateNoRepeatPlayers(['p1', 'p2', 'p3'], ['p1', 'p2']);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toHaveLength(2);
  });

  test('empty used list always passes', () => {
    const result = validateNoRepeatPlayers(['p1', 'p2', 'p3'], []);
    expect(result.valid).toBe(true);
  });
});

// ── validateLineupSlots ───────────────────────────────────────────────────────

describe('validateLineupSlots', () => {
  test('valid lineup passes', () => {
    const result = validateLineupSlots({ QB: 'id1', RB: 'id2', FLEX: 'id3' });
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('missing QB fails', () => {
    const result = validateLineupSlots({ QB: '', RB: 'id2', FLEX: 'id3' });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('QB');
  });

  test('all slots missing fails', () => {
    const result = validateLineupSlots({ QB: '', RB: '', FLEX: '' });
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
  });

  test('null slot values treated as missing', () => {
    const result = validateLineupSlots({ QB: null, RB: 'id2', FLEX: 'id3' });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('QB');
  });
});
