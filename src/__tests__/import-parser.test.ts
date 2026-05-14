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
