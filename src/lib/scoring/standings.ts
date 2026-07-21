import { Category } from '@/types'

export interface StandingsRow {
  player_user_id: string
  display_name: string
  total_points: number
  heisman_points: number
  cfp_points: number
  cinderella_points: number
  conference_champion_points: number
  most_improved_points: number
  disaster_draft_points: number
  // Generic per-category subtotal keyed by Category — lets the UI render columns
  // for whatever categories a given season actually enabled.
  category_points: Record<string, number>
  rank: number
  best_cinderella_rank: number | null
}

export interface ScoredPickInput {
  pick: {
    player_user_id: string
    draftable_entities?: { preseason_rank?: number | null } | null
    [key: string]: unknown
  }
  score: {
    category: string
    points: number
    calculation_json?: { outcome?: string } | null
    [key: string]: unknown
  }
}

export interface MemberInput {
  user_id: string
  display_name: string
  [key: string]: unknown
}

function emptyRow(userId: string, displayName: string): StandingsRow {
  return {
    player_user_id: userId,
    display_name: displayName,
    total_points: 0,
    heisman_points: 0,
    cfp_points: 0,
    cinderella_points: 0,
    conference_champion_points: 0,
    most_improved_points: 0,
    disaster_draft_points: 0,
    category_points: {},
    rank: 0,
    best_cinderella_rank: null,
  }
}

// Named per-category fields kept for backwards-compatible consumers. New code
// should prefer row.category_points[category].
const NAMED_FIELD: Record<string, keyof StandingsRow> = {
  heisman: 'heisman_points',
  cfp: 'cfp_points',
  cinderella: 'cinderella_points',
  conference_champion: 'conference_champion_points',
  most_improved: 'most_improved_points',
  disaster_draft: 'disaster_draft_points',
}

export function buildStandings(
  members: MemberInput[],
  scoredPicks: ScoredPickInput[]
): StandingsRow[] {
  const playerMap: Record<string, StandingsRow> = {}

  for (const member of members) {
    playerMap[member.user_id] = emptyRow(member.user_id, member.display_name)
  }

  for (const { pick, score } of scoredPicks) {
    const row = playerMap[pick.player_user_id]
    if (!row) continue

    const pts = Number(score.points) || 0
    row.total_points += pts

    const cat = score.category as Category
    row.category_points[cat] = (row.category_points[cat] ?? 0) + pts

    const namedField = NAMED_FIELD[cat]
    if (namedField) {
      // All named fields are numeric point totals.
      ;(row[namedField] as number) += pts
    }

    if (cat === 'cinderella' && score.calculation_json?.outcome) {
      const outcome = score.calculation_json.outcome
      const rankApprox = outcome === 'top_10' ? 10 :
        outcome === 'rank_11_20' ? 20 :
        outcome === 'rank_21_25' ? 25 : 999
      if (rankApprox < 999 && (row.best_cinderella_rank === null || rankApprox < row.best_cinderella_rank)) {
        row.best_cinderella_rank = rankApprox
      }
    }
  }

  const rows = Object.values(playerMap)

  rows.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points
    const aRank = a.best_cinderella_rank ?? 999
    const bRank = b.best_cinderella_rank ?? 999
    return aRank - bRank
  })

  let rank = 1
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 &&
      rows[i].total_points === rows[i - 1].total_points &&
      rows[i].best_cinderella_rank === rows[i - 1].best_cinderella_rank
    ) {
      rows[i].rank = rows[i - 1].rank
    } else {
      rows[i].rank = rank
    }
    rank++
  }

  return rows
}
