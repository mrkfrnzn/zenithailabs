/**
 * Snake draft order generation.
 * Odd rounds: 1,2,...,N  Even rounds: N,...,2,1
 */

import { Category } from '@/types'

export interface SnakePick {
  overall_pick_number: number
  round_number: number
  player_user_id: string
  category: Category
  draft_segment_id: string
}

export interface SegmentConfig {
  draft_segment_id: string
  category: Category
  pick_count_per_player: number
}

export function generateSnakeOrder(
  playerIds: string[], // ordered by draft_position
  segments: SegmentConfig[]
): SnakePick[] {
  const picks: SnakePick[] = []
  let overall = 1

  for (const segment of segments) {
    const { draft_segment_id, category, pick_count_per_player } = segment
    const n = playerIds.length

    for (let round = 1; round <= pick_count_per_player; round++) {
      const isForward = round % 2 === 1
      const order = isForward ? [...playerIds] : [...playerIds].reverse()

      for (const player_user_id of order) {
        picks.push({
          overall_pick_number: overall++,
          round_number: round,
          player_user_id,
          category,
          draft_segment_id,
        })
      }
    }
  }

  return picks
}

// Given overall pick number and the full snake schedule, return the player whose turn it is
export function getCurrentDrafter(
  picks: SnakePick[],
  committedPickNumbers: number[]
): SnakePick | null {
  const committed = new Set(committedPickNumbers)
  return picks.find(p => !committed.has(p.overall_pick_number)) ?? null
}
