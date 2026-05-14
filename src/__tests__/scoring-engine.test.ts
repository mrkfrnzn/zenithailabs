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
