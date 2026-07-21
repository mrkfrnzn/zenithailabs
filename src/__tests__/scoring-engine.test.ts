import { describe, it, expect } from 'vitest'
import { calculateScore, cinderellaRankToOutcome, DEFAULT_SCORING_CONFIGS } from '@/lib/scoring/engine'

describe('cinderellaRankToOutcome', () => {
  it('returns top_10 for rank 1-10', () => {
    expect(cinderellaRankToOutcome(1)).toBe('top_10')
    expect(cinderellaRankToOutcome(10)).toBe('top_10')
  })
  it('returns rank_11_20 for rank 11-20', () => {
    expect(cinderellaRankToOutcome(11)).toBe('rank_11_20')
    expect(cinderellaRankToOutcome(20)).toBe('rank_11_20')
  })
  it('returns rank_21_25 for rank 21-25', () => {
    expect(cinderellaRankToOutcome(21)).toBe('rank_21_25')
    expect(cinderellaRankToOutcome(25)).toBe('rank_21_25')
  })
  it('returns unranked for rank > 25 or null', () => {
    expect(cinderellaRankToOutcome(26)).toBe('unranked')
    expect(cinderellaRankToOutcome(null)).toBe('unranked')
  })
  // Bucket boundary: rank 25 is rank_21_25, not unranked
  it('handles exact boundary rank 25', () => {
    expect(cinderellaRankToOutcome(25)).toBe('rank_21_25')
  })
})

describe('calculateScore — Heisman', () => {
  const config = DEFAULT_SCORING_CONFIGS.heisman
  const context = {
    allPicksOddsByCategory: { heisman: [600, 800, 1000, 1200] },
    allPicksOddsByConference: {},
  }

  it('calculates winner correctly (lowest odds = 600)', () => {
    // points = 350 × (600 / 600) = 350
    const result = calculateScore(
      { draft_pick_id: 'p1', category: 'heisman', locked_odds: 600, outcome: 'winner' },
      config,
      context
    )
    expect(result.points).toBe(350)
    expect(result.formula).toContain('350')
    expect(result.lowest_drafted_odds).toBe(600)
  })

  it('calculates winner with long-shot correctly', () => {
    // points = 350 × (1200 / 600) = 700
    const result = calculateScore(
      { draft_pick_id: 'p2', category: 'heisman', locked_odds: 1200, outcome: 'winner' },
      config,
      context
    )
    expect(result.points).toBe(700)
  })

  it('calculates finalist_non_winner', () => {
    // points = 100 × (800 / 600) = 133.3
    const result = calculateScore(
      { draft_pick_id: 'p3', category: 'heisman', locked_odds: 800, outcome: 'finalist_non_winner' },
      config,
      context
    )
    expect(result.points).toBeCloseTo(133.3, 0)
  })

  it('returns 0 for no_score', () => {
    const result = calculateScore(
      { draft_pick_id: 'p4', category: 'heisman', locked_odds: 1000, outcome: 'no_score' },
      config,
      context
    )
    expect(result.points).toBe(0)
  })

  it('returns 0 when no outcome', () => {
    const result = calculateScore(
      { draft_pick_id: 'p5', category: 'heisman', locked_odds: 1000, outcome: null },
      config,
      context
    )
    expect(result.points).toBe(0)
  })
})

describe('calculateScore — CFP', () => {
  const config = DEFAULT_SCORING_CONFIGS.cfp
  const context = {
    allPicksOddsByCategory: { cfp: [500, 600, 700, 900] },
    allPicksOddsByConference: {},
  }

  it('calculates national title win correctly', () => {
    // 300 × (500/500) = 300
    const result = calculateScore(
      { draft_pick_id: 'p1', category: 'cfp', locked_odds: 500, outcome: 'wins_national_title' },
      config,
      context
    )
    expect(result.points).toBe(300)
  })

  it('calculates long-shot title win correctly', () => {
    // 300 × (900/500) = 540
    const result = calculateScore(
      { draft_pick_id: 'p2', category: 'cfp', locked_odds: 900, outcome: 'wins_national_title' },
      config,
      context
    )
    expect(result.points).toBe(540)
  })

  it('gives 0 for misses_playoff', () => {
    const result = calculateScore(
      { draft_pick_id: 'p3', category: 'cfp', locked_odds: 700, outcome: 'misses_playoff' },
      config,
      context
    )
    expect(result.points).toBe(0)
  })
})

describe('calculateScore — Cinderella (fixed points)', () => {
  const config = DEFAULT_SCORING_CONFIGS.cinderella

  it('returns 150 for top_10', () => {
    const result = calculateScore(
      { draft_pick_id: 'p1', category: 'cinderella', locked_odds: null, outcome: 'top_10' },
      config,
      { allPicksOddsByCategory: {}, allPicksOddsByConference: {} }
    )
    expect(result.points).toBe(150)
    expect(result.formula).toContain('fixed_points')
  })

  it('returns 75 for rank_11_20', () => {
    const result = calculateScore(
      { draft_pick_id: 'p2', category: 'cinderella', locked_odds: null, outcome: 'rank_11_20' },
      config,
      { allPicksOddsByCategory: {}, allPicksOddsByConference: {} }
    )
    expect(result.points).toBe(75)
  })

  it('returns 40 for rank_21_25', () => {
    const result = calculateScore(
      { draft_pick_id: 'p3', category: 'cinderella', locked_odds: null, outcome: 'rank_21_25' },
      config,
      { allPicksOddsByCategory: {}, allPicksOddsByConference: {} }
    )
    expect(result.points).toBe(40)
  })

  it('returns 0 for unranked', () => {
    const result = calculateScore(
      { draft_pick_id: 'p4', category: 'cinderella', locked_odds: null, outcome: 'unranked' },
      config,
      { allPicksOddsByCategory: {}, allPicksOddsByConference: {} }
    )
    expect(result.points).toBe(0)
  })
})

describe('calculateScore — Conference Champion', () => {
  const config = DEFAULT_SCORING_CONFIGS.conference_champion
  const context = {
    allPicksOddsByCategory: { conference_champion: [300, 400, 600] },
    allPicksOddsByConference: {
      SEC: [300, 400],
      'Big Ten': [200, 600],
    },
  }

  it('uses per-conference lowest odds', () => {
    // 150 × (400 / 300) = 200
    const result = calculateScore(
      { draft_pick_id: 'p1', category: 'conference_champion', locked_odds: 400, outcome: 'wins_conference_title_game', conference: 'SEC' },
      config,
      context
    )
    expect(result.lowest_drafted_odds).toBe(300)
    expect(result.points).toBeCloseTo(200, 0)
  })

  it('uses correct conference pool for Big Ten', () => {
    // 150 × (600 / 200) = 450
    const result = calculateScore(
      { draft_pick_id: 'p2', category: 'conference_champion', locked_odds: 600, outcome: 'wins_conference_title_game', conference: 'Big Ten' },
      config,
      context
    )
    expect(result.lowest_drafted_odds).toBe(200)
    expect(result.points).toBe(450)
  })
})

describe('calculateScore — Most Improved (wins_over_baseline)', () => {
  const config = DEFAULT_SCORING_CONFIGS.most_improved
  const ctx = { allPicksOddsByCategory: {}, allPicksOddsByConference: {} }

  it('scores wins above a half-win baseline proportionally', () => {
    // (9 − 5.5) × 25 = 87.5  (GDD §6.4 worked example)
    const result = calculateScore(
      { draft_pick_id: 'p1', category: 'most_improved', locked_odds: null, outcome: null, regular_season_wins: 9, preseason_win_total: 5.5 },
      config, ctx
    )
    expect(result.points).toBe(87.5)
  })

  it('floors at 0 when a team finishes below baseline', () => {
    const result = calculateScore(
      { draft_pick_id: 'p2', category: 'most_improved', locked_odds: null, outcome: null, regular_season_wins: 4, preseason_win_total: 6 },
      config, ctx
    )
    expect(result.points).toBe(0)
    expect(result.clamped).toBe(true)
  })

  it('caps at 250', () => {
    // (20 − 5) × 25 = 375 → capped to 250
    const result = calculateScore(
      { draft_pick_id: 'p3', category: 'most_improved', locked_odds: null, outcome: null, regular_season_wins: 20, preseason_win_total: 5 },
      config, ctx
    )
    expect(result.points).toBe(250)
    expect(result.clamped).toBe(true)
  })

  it('scores 0 with no result data', () => {
    const result = calculateScore(
      { draft_pick_id: 'p4', category: 'most_improved', locked_odds: null, outcome: null, regular_season_wins: null, preseason_win_total: 6 },
      config, ctx
    )
    expect(result.points).toBe(0)
    expect(result.formula).toContain('no_data')
  })
})

describe('calculateScore — Disaster Draft (inverted_record)', () => {
  const config = DEFAULT_SCORING_CONFIGS.disaster_draft
  const ctx = { allPicksOddsByCategory: {}, allPicksOddsByConference: {} }

  it('rewards a winless season with the shoot-the-moon bonus', () => {
    // 12×20 + 0×(−20) + 200 = 440  (GDD §6.5 worked example)
    const result = calculateScore(
      { draft_pick_id: 'p1', category: 'disaster_draft', locked_odds: null, outcome: null, regular_season_wins: 0, regular_season_losses: 12 },
      config, ctx
    )
    expect(result.points).toBe(440)
    expect(result.bonus).toBe(200)
  })

  it('nets losses against wins for a 2-10 team', () => {
    // 10×20 + 2×(−20) = 160
    const result = calculateScore(
      { draft_pick_id: 'p2', category: 'disaster_draft', locked_odds: null, outcome: null, regular_season_wins: 2, regular_season_losses: 10 },
      config, ctx
    )
    expect(result.points).toBe(160)
    expect(result.bonus).toBe(0)
  })

  it('floors at 0 for a .500 team', () => {
    // 6×20 + 6×(−20) = 0
    const result = calculateScore(
      { draft_pick_id: 'p3', category: 'disaster_draft', locked_odds: null, outcome: null, regular_season_wins: 6, regular_season_losses: 6 },
      config, ctx
    )
    expect(result.points).toBe(0)
  })

  it('floors at 0 for a winning team (would be negative)', () => {
    // 4×20 + 8×(−20) = −80 → floor 0
    const result = calculateScore(
      { draft_pick_id: 'p4', category: 'disaster_draft', locked_odds: null, outcome: null, regular_season_wins: 8, regular_season_losses: 4 },
      config, ctx
    )
    expect(result.points).toBe(0)
    expect(result.clamped).toBe(true)
  })

  it('does not pay the winless bonus once a team wins a game', () => {
    // 11×20 + 1×(−20) = 200, no bonus
    const result = calculateScore(
      { draft_pick_id: 'p5', category: 'disaster_draft', locked_odds: null, outcome: null, regular_season_wins: 1, regular_season_losses: 11 },
      config, ctx
    )
    expect(result.points).toBe(200)
    expect(result.bonus).toBe(0)
  })
})

describe('scoring engine idempotency', () => {
  const config = DEFAULT_SCORING_CONFIGS.heisman
  const context = {
    allPicksOddsByCategory: { heisman: [600, 800, 1000] },
    allPicksOddsByConference: {},
  }

  it('produces identical results when re-run', () => {
    const pick = { draft_pick_id: 'p1', category: 'heisman' as const, locked_odds: 800, outcome: 'winner' }
    const r1 = calculateScore(pick, config, context)
    const r2 = calculateScore(pick, config, context)
    expect(r1).toEqual(r2)
  })
})
