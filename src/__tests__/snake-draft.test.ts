import { describe, it, expect } from 'vitest'
import { generateSnakeOrder } from '@/lib/draft/snake'
import type { Category } from '@/types'

describe('generateSnakeOrder', () => {
  const players = ['p1', 'p2', 'p3', 'p4']
  const segments = [
    { draft_segment_id: 'seg1', category: 'heisman' as Category, pick_count_per_player: 4 },
    { draft_segment_id: 'seg2', category: 'cfp' as Category, pick_count_per_player: 2 },
  ]

  it('generates correct total picks', () => {
    const picks = generateSnakeOrder(players, segments)
    // 4 players × 4 rounds + 4 players × 2 rounds = 24
    expect(picks.length).toBe(24)
  })

  it('first round goes forward (p1,p2,p3,p4)', () => {
    const picks = generateSnakeOrder(players, segments)
    const round1 = picks.slice(0, 4)
    expect(round1.map(p => p.player_user_id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('second round goes backward (p4,p3,p2,p1)', () => {
    const picks = generateSnakeOrder(players, segments)
    const round2 = picks.slice(4, 8)
    expect(round2.map(p => p.player_user_id)).toEqual(['p4', 'p3', 'p2', 'p1'])
  })

  it('third round goes forward again', () => {
    const picks = generateSnakeOrder(players, segments)
    const round3 = picks.slice(8, 12)
    expect(round3.map(p => p.player_user_id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('assigns correct overall_pick_number starting at 1', () => {
    const picks = generateSnakeOrder(players, segments)
    expect(picks[0].overall_pick_number).toBe(1)
    expect(picks[23].overall_pick_number).toBe(24)
  })

  it('each pick has the correct segment category', () => {
    const picks = generateSnakeOrder(players, segments)
    const seg1Picks = picks.filter(p => p.draft_segment_id === 'seg1')
    const seg2Picks = picks.filter(p => p.draft_segment_id === 'seg2')
    expect(seg1Picks.length).toBe(16) // 4 players × 4 rounds
    expect(seg2Picks.length).toBe(8)  // 4 players × 2 rounds
    expect(seg1Picks.every(p => p.category === 'heisman')).toBe(true)
    expect(seg2Picks.every(p => p.category === 'cfp')).toBe(true)
  })

  it('every player gets equal picks per segment', () => {
    const picks = generateSnakeOrder(players, segments)
    for (const playerId of players) {
      const playerSeg1 = picks.filter(p => p.player_user_id === playerId && p.draft_segment_id === 'seg1')
      expect(playerSeg1.length).toBe(4)
    }
  })

  it('works with 2 players', () => {
    const twoPlayers = ['p1', 'p2']
    const seg = [{ draft_segment_id: 's1', category: 'heisman' as Category, pick_count_per_player: 3 }]
    const picks = generateSnakeOrder(twoPlayers, seg)
    expect(picks.length).toBe(6)
    expect(picks.map(p => p.player_user_id)).toEqual(['p1', 'p2', 'p2', 'p1', 'p1', 'p2'])
  })
})
