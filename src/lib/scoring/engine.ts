/**
 * CFP War Chest Scoring Engine
 *
 * All formulas read from scoring_configs stored in the database.
 * The engine is deterministic / idempotent — same inputs always produce same outputs.
 */

import { ScoringConfigData, CalculationDetail, Category } from '@/types'

export interface PickInput {
  draft_pick_id: string
  category: Category
  locked_odds: number | null
  outcome: string | null
  // For conference_champion: conference of the school
  conference?: string | null
  // For record-based categories (Most Improved / Disaster Draft): regular-season
  // record and the locked preseason win total (Most Improved baseline).
  regular_season_wins?: number | null
  regular_season_losses?: number | null
  preseason_win_total?: number | null
}

export interface ScoringContext {
  // Map of category -> array of locked_odds values for ALL picks in that category in this league
  allPicksOddsByCategory: Record<string, number[]>
  // For conference_champion: map of conference -> array of locked_odds in that conference
  allPicksOddsByConference: Record<string, number[]>
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Clamp a raw score to [floor, cap]. cap == null/undefined means uncapped. */
function clampScore(
  raw: number,
  floor: number | null | undefined,
  cap: number | null | undefined
): { value: number; clamped: boolean } {
  let value = raw
  let clamped = false
  if (floor != null && value < floor) {
    value = floor
    clamped = true
  }
  if (cap != null && value > cap) {
    value = cap
    clamped = true
  }
  return { value, clamped }
}

export function calculateScore(
  pick: PickInput,
  config: ScoringConfigData,
  context: ScoringContext
): CalculationDetail {
  const { category, locked_odds, outcome } = pick

  // ── Record-based formulas ──────────────────────────────────────────────────
  // These score from the regular-season record, not an outcome-bucket string, so
  // they are handled before the generic "no outcome ⇒ 0" guard below.
  if (config.formula === 'wins_over_baseline') {
    return scoreWinsOverBaseline(pick, config)
  }
  if (config.formula === 'inverted_record') {
    return scoreInvertedRecord(pick, config)
  }

  // ── Outcome-bucket formulas (Heisman / CFP / Cinderella / Conf. Champion) ────
  if (!outcome) {
    return {
      outcome: null,
      locked_odds,
      lowest_drafted_odds: null,
      multiplier: null,
      fixed_points: null,
      formula: 'no_outcome',
      points: 0,
    }
  }

  const outcomeConfig = config.outcomes?.[outcome]
  if (!outcomeConfig) {
    return {
      outcome,
      locked_odds,
      lowest_drafted_odds: null,
      multiplier: null,
      fixed_points: null,
      formula: 'unknown_outcome',
      points: 0,
    }
  }

  // Fixed points (Cinderella)
  if (config.formula === 'fixed_points') {
    const points = outcomeConfig.points ?? 0
    return {
      outcome,
      locked_odds,
      lowest_drafted_odds: null,
      multiplier: null,
      fixed_points: points,
      formula: `fixed_points[${outcome}]=${points}`,
      points,
    }
  }

  // Multiplier × (entity_odds / lowest_drafted_odds_in_scope)
  const multiplier = outcomeConfig.multiplier ?? 0
  if (multiplier === 0 || !locked_odds) {
    return {
      outcome,
      locked_odds,
      lowest_drafted_odds: null,
      multiplier,
      fixed_points: null,
      formula: `multiplier=${multiplier} × (odds/lowest)`,
      points: 0,
    }
  }

  // Get lowest-drafted-odds pool
  let oddsPool: number[]
  if (category === 'conference_champion' && pick.conference) {
    oddsPool = context.allPicksOddsByConference[pick.conference] ?? []
  } else {
    oddsPool = context.allPicksOddsByCategory[category] ?? []
  }

  const validOdds = oddsPool.filter(o => o != null && o > 0)
  if (validOdds.length === 0) {
    return {
      outcome,
      locked_odds,
      lowest_drafted_odds: null,
      multiplier,
      fixed_points: null,
      formula: 'no_valid_odds_in_pool',
      points: 0,
    }
  }

  const lowest_drafted_odds = Math.min(...validOdds)
  const points = multiplier * (locked_odds / lowest_drafted_odds)

  return {
    outcome,
    locked_odds,
    lowest_drafted_odds,
    multiplier,
    fixed_points: null,
    formula: `${multiplier} × (${locked_odds} / ${lowest_drafted_odds})`,
    points: round1(points),
  }
}

// ── Most Improved: clamp((wins − baseline) × pointsPerWin, floor, cap) ────────
function scoreWinsOverBaseline(pick: PickInput, config: ScoringConfigData): CalculationDetail {
  const wins = pick.regular_season_wins
  const baseline = pick.preseason_win_total
  const pointsPerWin = config.points_per_win ?? 25
  const floor = config.floor ?? 0
  const cap = config.cap === undefined ? 250 : config.cap

  const base: CalculationDetail = {
    outcome: pick.outcome,
    locked_odds: null,
    lowest_drafted_odds: null,
    multiplier: null,
    fixed_points: null,
    formula: 'wins_over_baseline',
    points: 0,
    regular_season_wins: wins ?? null,
    preseason_win_total: baseline ?? null,
  }

  if (wins == null || baseline == null) {
    return { ...base, formula: 'wins_over_baseline:no_data' }
  }

  const delta = wins - baseline
  const raw = delta * pointsPerWin
  const { value, clamped } = clampScore(raw, floor, cap)

  return {
    ...base,
    formula: `clamp((${wins} − ${baseline}) × ${pointsPerWin}, ${floor}, ${cap ?? '∞'})`,
    points: round1(value),
    clamped,
  }
}

// ── Disaster Draft: clamp(losses×pL + wins×pW + winlessBonus, floor, cap) ──────
function scoreInvertedRecord(pick: PickInput, config: ScoringConfigData): CalculationDetail {
  const wins = pick.regular_season_wins
  const losses = pick.regular_season_losses
  const pointsPerLoss = config.points_per_loss ?? 20
  const pointsPerWin = config.points_per_win ?? -20
  const winlessBonus = config.winless_bonus ?? 200
  const floor = config.floor ?? 0
  const cap = config.cap ?? null

  const base: CalculationDetail = {
    outcome: pick.outcome,
    locked_odds: null,
    lowest_drafted_odds: null,
    multiplier: null,
    fixed_points: null,
    formula: 'inverted_record',
    points: 0,
    regular_season_wins: wins ?? null,
    regular_season_losses: losses ?? null,
  }

  if (wins == null && losses == null) {
    return { ...base, formula: 'inverted_record:no_data' }
  }

  const w = wins ?? 0
  const l = losses ?? 0
  const bonus = w === 0 ? winlessBonus : 0
  const raw = l * pointsPerLoss + w * pointsPerWin + bonus
  const { value, clamped } = clampScore(raw, floor, cap)

  return {
    ...base,
    formula: `clamp(${l}×${pointsPerLoss} + ${w}×${pointsPerWin}${bonus ? ` + ${bonus} winless` : ''}, ${floor}, ${cap ?? '∞'})`,
    points: round1(value),
    bonus,
    clamped,
  }
}

// ── Default scoring configs (seeded into DB) ─────────────────────────────────

export const DEFAULT_SCORING_CONFIGS: Record<Category, ScoringConfigData> = {
  heisman: {
    formula: 'multiplier_odds_ratio',
    outcomes: {
      winner: { multiplier: 350 },
      finalist_non_winner: { multiplier: 100 },
      no_score: { multiplier: 0 },
    },
  },
  cfp: {
    formula: 'multiplier_odds_ratio',
    outcomes: {
      wins_national_title: { multiplier: 300 },
      loses_final: { multiplier: 200 },
      loses_semifinal: { multiplier: 100 },
      makes_playoff_no_semifinal: { multiplier: 20 },
      misses_playoff: { multiplier: 0 },
    },
  },
  cinderella: {
    formula: 'fixed_points',
    outcomes: {
      top_10: { points: 150 },
      rank_11_20: { points: 75 },
      rank_21_25: { points: 40 },
      unranked: { points: 0 },
    },
  },
  conference_champion: {
    formula: 'multiplier_odds_ratio',
    outcomes: {
      wins_conference_title_game: { multiplier: 150 },
      loses_conference_title_game: { multiplier: 75 },
      fails_to_qualify: { multiplier: 0 },
    },
  },
  // Most Improved — 25 points per regular-season win above the locked preseason
  // win total, clamped to [0, 250]. (GDD §6.4)
  most_improved: {
    formula: 'wins_over_baseline',
    points_per_win: 25,
    floor: 0,
    cap: 250,
  },
  // Disaster Draft — losses help (+20), wins hurt (−20), a winless season pays a
  // +200 "shoot the moon" bonus. Floor 0, uncapped. (GDD §6.5)
  disaster_draft: {
    formula: 'inverted_record',
    points_per_loss: 20,
    points_per_win: -20,
    winless_bonus: 200,
    floor: 0,
    cap: null,
  },
}

// ── Map final AP rank to Cinderella outcome bucket ──────────────────────────
export function cinderellaRankToOutcome(finalRank: number | null): string {
  if (!finalRank) return 'unranked'
  if (finalRank <= 10) return 'top_10'
  if (finalRank <= 20) return 'rank_11_20'
  if (finalRank <= 25) return 'rank_21_25'
  return 'unranked'
}
