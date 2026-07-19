// Database types matching the PRD schema exactly

export type UserRole = 'admin' | 'player'
export type LeagueStatus = 'setup' | 'data_imported' | 'draft_ready' | 'drafting' | 'drafted' | 'scoring' | 'completed'
export type InviteStatus = 'pending' | 'accepted'
export type EntityType = 'athlete' | 'school'
export type Category =
  | 'heisman'
  | 'cfp'
  | 'cinderella'
  | 'conference_champion'
  | 'most_improved'
  | 'disaster_draft'
export type DraftSegmentStatus = 'pending' | 'active' | 'completed'
export type DraftStateStatus = 'not_started' | 'active' | 'paused' | 'completed'
export type ResultImportStatus = 'pending' | 'reviewing' | 'approved' | 'published'
export type MatchStatus = 'auto' | 'fuzzy' | 'manual' | 'unmatched'

export interface User {
  id: string
  email: string
  display_name: string
  role: UserRole
  created_at: string
}

export interface League {
  id: string
  name: string
  season_year: number
  status: LeagueStatus
  settings_json: LeagueSettings
  created_by: string
  created_at: string
  updated_at: string
}

export interface LeagueSettings {
  max_players: number
  conferences: string[]
  // Partial: a season only carries pick counts for its enabled categories
  // (e.g. 2026 hides conference_champion, 2025 has no most_improved/disaster_draft).
  pick_counts: Partial<Record<Category, number>>
  cinderella_ap_threshold: number
  draft_timer_enabled: boolean
  draft_timer_seconds: number
  draft_timer_on_expiry: 'auto_skip' | 'pause'
  draft_segment_order: Category[]
  trash_talk_enabled: boolean
  allow_provisional_visibility: boolean
  is_archive: boolean
}

export interface LeagueMember {
  id: string
  league_id: string
  user_id: string
  display_name: string
  role_in_league: UserRole
  draft_position: number | null
  invite_status: InviteStatus
  created_at: string
}

export interface DraftableEntity {
  id: string
  league_id: string
  entity_type: EntityType
  athlete_name: string | null
  school_name: string | null
  conference: string | null
  position: string | null
  preseason_rank: number | null
  odds: number | null
  odds_source: string | null
  eligible_categories_json: Category[]
  raw_import_json: Record<string, unknown>
  normalized_name: string
  locked: boolean
  created_at: string
}

export interface DraftSegment {
  id: string
  league_id: string
  category: Category
  segment_order: number
  pick_count_per_player: number
  status: DraftSegmentStatus
}

export interface DraftPick {
  id: string
  league_id: string
  draft_segment_id: string
  round_number: number
  overall_pick_number: number
  player_user_id: string
  draftable_entity_id: string
  category: Category
  locked_odds: number | null
  pick_timestamp: string
  admin_override: boolean
  override_reason: string | null
}

export interface DraftState {
  id: string
  league_id: string
  status: DraftStateStatus
  current_segment_id: string | null
  current_overall_pick_number: number
  current_player_user_id: string | null
  paused: boolean
  timer_seconds_remaining: number | null
  updated_at: string
}

export interface ScoringConfig {
  id: string
  league_id: string
  category: Category
  config_json: ScoringConfigData
  locked: boolean
  created_at: string
  updated_at: string
}

export type ScoringFormula =
  | 'multiplier_odds_ratio' // Heisman, CFP Run, Conference Champion
  | 'fixed_points' // Cinderella (rank bands)
  | 'wins_over_baseline' // Most Improved
  | 'inverted_record' // Disaster Draft

export interface ScoringOutcome {
  multiplier?: number
  points?: number
}

export interface ScoringConfigData {
  formula: ScoringFormula
  // Outcome buckets for multiplier_odds_ratio and fixed_points formulas.
  outcomes?: Record<string, ScoringOutcome>
  // wins_over_baseline (Most Improved): points per regular-season win above the
  // locked preseason win total, clamped to [floor, cap].
  points_per_win?: number
  // inverted_record (Disaster Draft): losses add points, wins subtract points,
  // and a winless season pays the winless_bonus. Clamped to [floor, cap].
  points_per_loss?: number
  winless_bonus?: number
  // Shared clamps for the two record-based formulas. cap === null means uncapped.
  floor?: number
  cap?: number | null
}

export interface ResultImport {
  id: string
  league_id: string
  result_type: Category
  file_name: string
  status: ResultImportStatus
  raw_rows_json: Record<string, unknown>[]
  created_by: string
  created_at: string
}

export interface ResultRow {
  id: string
  result_import_id: string
  league_id: string
  matched_entity_id: string | null
  raw_row_json: Record<string, unknown>
  normalized_values_json: Record<string, unknown>
  outcome: string | null
  match_status: MatchStatus
  admin_notes: string | null
}

export interface Score {
  id: string
  league_id: string
  draft_pick_id: string
  category: Category
  outcome: string | null
  points: number
  calculation_json: CalculationDetail
  published: boolean
  created_at: string
  updated_at: string
}

export interface CalculationDetail {
  outcome: string | null
  locked_odds: number | null
  lowest_drafted_odds: number | null
  multiplier: number | null
  fixed_points: number | null
  formula: string
  points: number
  // Record-based formulas (Most Improved / Disaster Draft) populate these so the
  // pick-detail UI can show the full breakdown without recomputing.
  regular_season_wins?: number | null
  regular_season_losses?: number | null
  preseason_win_total?: number | null
  bonus?: number | null
  clamped?: boolean
}

export interface TrashTalkPost {
  id: string
  league_id: string
  user_id: string
  body: string
  deleted: boolean
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  league_id: string
  actor_user_id: string
  action: string
  entity_type: string
  entity_id: string
  before_json: Record<string, unknown> | null
  after_json: Record<string, unknown> | null
  created_at: string
}
