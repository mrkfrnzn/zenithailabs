import { describe, it, expect } from 'vitest'
import { parseCSV, validateRows, normalizeName } from '@/lib/import/parser'

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName("Jeremiah Smith")).toBe('jeremiah smith')
    expect(normalizeName("Ohio State")).toBe('ohio state')
    expect(normalizeName("Miami (FL)")).toBe('miami fl')
  })
  it('handles null/empty', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName('')).toBe('')
  })
})

describe('parseCSV', () => {
  it('parses simple CSV with header', () => {
    const csv = `athlete_name,odds\nJeremiah Smith,1000\nArch Manning,600`
    const rows = parseCSV(Buffer.from(csv))
    expect(rows).toHaveLength(2)
    expect(rows[0].athlete_name).toBe('Jeremiah Smith')
    expect(rows[0].odds).toBe(1000)
  })

  it('normalizes headers to lowercase snake_case', () => {
    const csv = `Athlete Name,School Name\nJeremiah Smith,Ohio State`
    const rows = parseCSV(Buffer.from(csv))
    expect(rows[0]['athlete_name']).toBe('Jeremiah Smith')
    expect(rows[0]['school_name']).toBe('Ohio State')
  })
})

describe('validateRows — heisman', () => {
  const validRow = { athlete_name: 'Smith', school_name: 'Ohio State', position: 'WR', odds: 1000, source: 'FanDuel' }

  it('passes valid rows', () => {
    const flags = validateRows([validRow], 'heisman')
    expect(flags.filter(f => f.type !== 'negative_odds')).toHaveLength(0)
  })

  it('flags missing odds', () => {
    const flags = validateRows([{ ...validRow, odds: null }], 'heisman')
    expect(flags.some(f => f.type === 'missing_column' && f.field === 'odds')).toBe(true)
  })

  it('flags non-integer odds', () => {
    const flags = validateRows([{ ...validRow, odds: 'abc' as unknown as number }], 'heisman')
    expect(flags.some(f => f.type === 'invalid_odds')).toBe(true)
  })

  it('flags duplicate entries', () => {
    const flags = validateRows([validRow, validRow], 'heisman')
    expect(flags.some(f => f.type === 'duplicate')).toBe(true)
  })

  it('flags negative odds (favorites)', () => {
    const flags = validateRows([{ ...validRow, odds: -150 }], 'heisman')
    expect(flags.some(f => f.type === 'negative_odds')).toBe(true)
  })
})

describe('validateRows — cinderella', () => {
  it('flags ranked school as eligibility conflict', () => {
    const row = { school_name: 'Ohio State', conference: 'Big Ten', preseason_ap_rank: 5, source: 'AP' }
    const flags = validateRows([row], 'cinderella')
    expect(flags.some(f => f.type === 'eligibility_conflict')).toBe(true)
  })

  it('does not flag unranked school', () => {
    const row = { school_name: 'Boise State', conference: 'Mountain West', preseason_ap_rank: null, source: 'AP' }
    const flags = validateRows([row], 'cinderella')
    expect(flags.some(f => f.type === 'eligibility_conflict')).toBe(false)
  })
})

describe('validateRows — most_improved', () => {
  const validRow = { school_name: 'Oklahoma State', conference: 'Big 12', preseason_win_total: 5.5, source: 'DraftKings' }

  it('passes a valid row', () => {
    const flags = validateRows([validRow], 'most_improved')
    expect(flags).toHaveLength(0)
  })

  it('flags a missing preseason_win_total column', () => {
    const row = { school_name: 'Oklahoma State', conference: 'Big 12', source: 'DraftKings' }
    const flags = validateRows([row], 'most_improved')
    expect(flags.some(f => f.type === 'missing_column' && f.field === 'preseason_win_total')).toBe(true)
  })

  it('flags a non-numeric win total', () => {
    const row = { ...validRow, preseason_win_total: 'six' as unknown as number }
    const flags = validateRows([row], 'most_improved')
    expect(flags.some(f => f.field === 'preseason_win_total' && f.type === 'invalid_odds')).toBe(true)
  })
})

describe('validateRows — disaster_draft', () => {
  it('passes a P4 school', () => {
    const row = { school_name: 'Mississippi State', conference: 'SEC', source: 'internal' }
    const flags = validateRows([row], 'disaster_draft')
    expect(flags.some(f => f.type === 'eligibility_conflict')).toBe(false)
  })

  it('passes Notre Dame regardless of conference label', () => {
    const row = { school_name: 'Notre Dame', conference: 'Independent', source: 'internal' }
    const flags = validateRows([row], 'disaster_draft')
    expect(flags.some(f => f.type === 'eligibility_conflict')).toBe(false)
  })

  it('flags a non-P4 school as an eligibility conflict', () => {
    const row = { school_name: 'New Mexico State', conference: 'Conference USA', source: 'internal' }
    const flags = validateRows([row], 'disaster_draft')
    expect(flags.some(f => f.type === 'eligibility_conflict')).toBe(true)
  })
})
