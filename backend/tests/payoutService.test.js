const { findApplicableRule, calcPayouts, computePayoutSummary } = require('../services/payoutService');

const DEFAULT_RULES = [
  { id: '1', min_players: 1,  max_players: 5,  first_pct: 90, second_pct: 0,  third_pct: 0,  fourth_pct: 0,  house_pct: 10 },
  { id: '2', min_players: 6,  max_players: 10, first_pct: 70, second_pct: 20, third_pct: 0,  fourth_pct: 0,  house_pct: 10 },
  { id: '3', min_players: 11, max_players: 15, first_pct: 60, second_pct: 25, third_pct: 5,  fourth_pct: 0,  house_pct: 10 },
  { id: '4', min_players: 16, max_players: 20, first_pct: 55, second_pct: 25, third_pct: 10, fourth_pct: 0,  house_pct: 10 },
  { id: '5', min_players: 21, max_players: 30, first_pct: 50, second_pct: 25, third_pct: 15, fourth_pct: 0,  house_pct: 10 },
  { id: '6', min_players: 31, max_players: 50, first_pct: 50, second_pct: 20, third_pct: 15, fourth_pct: 5,  house_pct: 10 },
];

// ── findApplicableRule ────────────────────────────────────────────────────────

describe('findApplicableRule', () => {
  test('finds rule for 1 player (1-5 tier)', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 1);
    expect(rule.first_pct).toBe(90);
  });

  test('finds rule for 5 players (1-5 tier boundary)', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 5);
    expect(rule.first_pct).toBe(90);
  });

  test('finds rule for 6 players (6-10 tier)', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 6);
    expect(rule.first_pct).toBe(70);
    expect(rule.second_pct).toBe(20);
  });

  test('finds rule for 10 players (6-10 tier boundary)', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 10);
    expect(rule.first_pct).toBe(70);
  });

  test('finds rule for 50 players (31-50 tier)', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 50);
    expect(rule.fourth_pct).toBe(5);
  });

  test('returns null for out-of-range count', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 0);
    expect(rule).toBeNull();
  });

  test('returns null for count above max', () => {
    const rule = findApplicableRule(DEFAULT_RULES, 999);
    expect(rule).toBeNull();
  });
});

// ── calcPayouts ───────────────────────────────────────────────────────────────

describe('calcPayouts', () => {
  const rankedEntries = [
    { entry_id: 'e1', rank: 1, displayName: 'Alice' },
    { entry_id: 'e2', rank: 2, displayName: 'Bob'   },
    { entry_id: 'e3', rank: 3, displayName: 'Charlie' },
  ];

  test('1-5 player rule: only 1st and house', () => {
    const rule    = DEFAULT_RULES[0]; // 1-5
    const payouts = calcPayouts(rule, 250, rankedEntries);
    const labels  = payouts.map(p => p.label);
    expect(labels).toContain('1st Place');
    expect(labels).toContain('House');
    expect(labels).not.toContain('2nd Place');
  });

  test('6-10 player rule: 1st, 2nd, house', () => {
    const rule    = DEFAULT_RULES[1]; // 6-10
    const payouts = calcPayouts(rule, 500, rankedEntries);
    expect(payouts.find(p => p.label === '1st Place').amount).toBe(350);
    expect(payouts.find(p => p.label === '2nd Place').amount).toBe(100);
    expect(payouts.find(p => p.label === 'House').amount).toBe(50);
  });

  test('percentages sum to 100 (31-50 tier)', () => {
    const rule = DEFAULT_RULES[5]; // 31-50
    const total = rule.first_pct + rule.second_pct + rule.third_pct + rule.fourth_pct + rule.house_pct;
    expect(total).toBe(100);
  });

  test('amounts sum to total pot', () => {
    const rule    = DEFAULT_RULES[2]; // 11-15
    const pot     = 750;
    const payouts = calcPayouts(rule, pot, rankedEntries);
    const sum     = payouts.reduce((acc, p) => acc + p.amount, 0);
    expect(Math.round(sum * 100)).toBe(Math.round(pot * 100));
  });

  test('house always gets 10%', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.house_pct).toBe(10);
    }
  });
});

// ── computePayoutSummary ──────────────────────────────────────────────────────

describe('computePayoutSummary', () => {
  const ranked = [
    { entry_id: 'e1', rank: 1 },
    { entry_id: 'e2', rank: 2 },
    { entry_id: 'e3', rank: 3 },
  ];

  test('calculates total pot = entryFee × paidCount', () => {
    const { totalPot } = computePayoutSummary(50, 7, DEFAULT_RULES, ranked);
    expect(totalPot).toBe(350);
  });

  test('house cut = 10% of total pot', () => {
    const { houseCut } = computePayoutSummary(50, 7, DEFAULT_RULES, ranked);
    expect(houseCut).toBe(35);
  });

  test('prize pool = total pot - house cut', () => {
    const { totalPot, houseCut, prizePool } = computePayoutSummary(50, 7, DEFAULT_RULES, ranked);
    expect(prizePool).toBe(totalPot - houseCut);
  });

  test('correct tier selected for 7 players (6-10)', () => {
    const { rule } = computePayoutSummary(50, 7, DEFAULT_RULES, ranked);
    expect(rule.first_pct).toBe(70);
    expect(rule.second_pct).toBe(20);
  });
});
