/**
 * Server-side CSV/XLSX parser for preseason and results imports.
 * Uses papaparse (CSV) and SheetJS (XLSX). Never runs in browser.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Category } from '@/types'

export type ParsedRow = Record<string, string | number | null>

export function parseCSV(buffer: Buffer): ParsedRow[] {
  const text = buffer.toString('utf-8')
  const result = Papa.parse<ParsedRow>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })
  return result.data
}

export function parseXLSX(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  return rows.map(row => {
    const normalized: ParsedRow = {}
    for (const [key, val] of Object.entries(row)) {
      normalized[key.trim().toLowerCase().replace(/\s+/g, '_')] =
        typeof val === 'string' ? val.trim() || null :
        typeof val === 'number' ? val : null
    }
    return normalized
  })
}

// Power 4 conferences — Disaster Draft eligibility is limited to these plus
// Notre Dame (GDD §6.5 / PRD §6).
export const P4_CONFERENCES = ['sec', 'big ten', 'big 12', 'acc']

// ── Required columns per category ────────────────────────────────────────────
export const REQUIRED_COLUMNS: Record<Category, string[]> = {
  heisman: ['athlete_name', 'school_name', 'position', 'odds', 'source'],
  cfp: ['school_name', 'conference', 'preseason_rank', 'national_title_odds', 'source'],
  cinderella: ['school_name', 'conference', 'source'],
  conference_champion: ['school_name', 'conference', 'conference_title_odds', 'source'],
  // Most Improved — locked preseason regular-season win total is the baseline.
  most_improved: ['school_name', 'conference', 'preseason_win_total', 'source'],
  // Disaster Draft — P4 + Notre Dame only; no odds.
  disaster_draft: ['school_name', 'conference', 'source'],
}

// Column aliases (alternate headers → canonical name)
const COLUMN_ALIASES: Record<string, string> = {
  name: 'athlete_name',
  player: 'athlete_name',
  team: 'school_name',
  school: 'school_name',
  pos: 'position',
  american_odds: 'odds',
  title_odds: 'national_title_odds',
  conf_title_odds: 'conference_title_odds',
  rank: 'preseason_rank',
  ap_rank: 'preseason_ap_rank',
  preseason_ap_rank: 'preseason_ap_rank',
  conf: 'conference',
  // Most Improved win-total header variants
  win_total: 'preseason_win_total',
  preseason_wins: 'preseason_win_total',
  over_under: 'preseason_win_total',
  ou_line: 'preseason_win_total',
  vegas_win_total: 'preseason_win_total',
}

export function normalizeRow(row: ParsedRow): ParsedRow {
  const out: ParsedRow = {}
  for (const [key, val] of Object.entries(row)) {
    const canonical = COLUMN_ALIASES[key] ?? key
    out[canonical] = val
  }
  return out
}

// ── Name normalization for matching ──────────────────────────────────────────
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

// ── Validation ───────────────────────────────────────────────────────────────
export interface ValidationFlag {
  row_index: number
  field: string
  type: 'missing_column' | 'invalid_odds' | 'duplicate' | 'eligibility_conflict' | 'negative_odds'
  message: string
}

export function validateRows(
  rows: ParsedRow[],
  category: Category,
  existingNormalizedNames: string[] = []
): ValidationFlag[] {
  const flags: ValidationFlag[] = []
  const required = REQUIRED_COLUMNS[category]
  const seenNames = new Set<string>()

  // Check required columns present at all
  if (rows.length > 0) {
    const firstRow = rows[0]
    for (const col of required) {
      if (!(col in firstRow)) {
        flags.push({ row_index: -1, field: col, type: 'missing_column', message: `Required column "${col}" is missing` })
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // Odds validation
    const oddsField = category === 'heisman' ? 'odds' :
      category === 'cfp' ? 'national_title_odds' :
      category === 'conference_champion' ? 'conference_title_odds' : null

    if (oddsField) {
      const oddsVal = row[oddsField]
      if (oddsVal == null || oddsVal === '') {
        flags.push({ row_index: i, field: oddsField, type: 'missing_column', message: `Row ${i + 1}: odds missing` })
      } else if (typeof oddsVal !== 'number' || !Number.isInteger(oddsVal)) {
        flags.push({ row_index: i, field: oddsField, type: 'invalid_odds', message: `Row ${i + 1}: odds must be an integer` })
      } else if (oddsVal < 0) {
        flags.push({ row_index: i, field: oddsField, type: 'negative_odds', message: `Row ${i + 1}: negative odds (favorite) — review before locking` })
      }
    }

    // Duplicate check
    const nameKey = category === 'heisman'
      ? `${normalizeName(String(row.athlete_name ?? ''))}__${normalizeName(String(row.school_name ?? ''))}`
      : normalizeName(String(row.school_name ?? ''))

    if (seenNames.has(nameKey)) {
      flags.push({ row_index: i, field: 'name', type: 'duplicate', message: `Row ${i + 1}: duplicate entry` })
    }
    seenNames.add(nameKey)

    // Cinderella eligibility: school ranked in top 25 shouldn't be cinderella by default
    if (category === 'cinderella') {
      const rank = row.preseason_ap_rank
      if (typeof rank === 'number' && rank <= 25) {
        flags.push({
          row_index: i,
          field: 'preseason_ap_rank',
          type: 'eligibility_conflict',
          message: `Row ${i + 1}: school ranked #${rank} — not eligible for Cinderella by default (must start outside Top 25)`,
        })
      }
    }

    // Most Improved: baseline win total must be numeric
    if (category === 'most_improved') {
      const wt = row.preseason_win_total
      if (wt != null && wt !== '' && typeof wt !== 'number') {
        flags.push({
          row_index: i,
          field: 'preseason_win_total',
          type: 'invalid_odds',
          message: `Row ${i + 1}: preseason_win_total must be a number (e.g. 5.5)`,
        })
      }
    }

    // Disaster Draft: eligibility limited to P4 conferences + Notre Dame
    if (category === 'disaster_draft') {
      const conf = normalizeName(String(row.conference ?? ''))
      const school = normalizeName(String(row.school_name ?? ''))
      const isNotreDame = school === 'notre dame'
      if (!isNotreDame && !P4_CONFERENCES.includes(conf)) {
        flags.push({
          row_index: i,
          field: 'conference',
          type: 'eligibility_conflict',
          message: `Row ${i + 1}: "${row.conference ?? '—'}" is not P4 — Disaster Draft is limited to SEC, Big Ten, Big 12, ACC + Notre Dame`,
        })
      }
    }

    // CFP: school in top 25 marked as cinderella eligible
    if (category === 'cfp') {
      const eligible = row.eligible_categories
      if (typeof eligible === 'string' && eligible.includes('cinderella')) {
        const rank = row.preseason_rank
        if (typeof rank === 'number' && rank <= 25) {
          flags.push({
            row_index: i,
            field: 'eligible_categories',
            type: 'eligibility_conflict',
            message: `Row ${i + 1}: top-25 school marked as Cinderella eligible`,
          })
        }
      }
    }
  }

  return flags
}
