export * from './database'
import type { DraftPick, DraftableEntity, Score, Category, LeagueMember } from './database'

// Extended types for UI (joins resolved)
export interface DraftPickWithEntity extends DraftPick {
  entity: DraftableEntity
  player: { display_name: string; user_id: string }
}

export interface ScoreWithPick extends Score {
  pick: DraftPickWithEntity
}

export interface StandingsRow {
  player_user_id: string
  display_name: string
  total_points: number
  heisman_points: number
  cfp_points: number
  cinderella_points: number
  conference_champion_points: number
  rank: number
  best_cinderella_rank: number | null
}

export interface DraftBoardEntry {
  overall_pick_number: number
  round_number: number
  player_user_id: string
  player_display_name: string
  category: Category
  entity_name: string
  locked_odds: number | null
  pick_timestamp: string
}

// Supabase query result shapes (loose, for server routes)
export type SupabaseMemberRow = {
  user_id: string
  display_name: string
  draft_position?: number | null
  [key: string]: unknown
}

export type SupabaseScoreRow = {
  [key: string]: unknown
  draft_picks: Record<string, unknown>
}
