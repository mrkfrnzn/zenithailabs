/**
 * Fuzzy name matching for results import.
 * Uses fuse.js for approximate string matching.
 */

import Fuse from 'fuse.js'
import { normalizeName } from './parser'

export interface FuzzyCandidate {
  id: string
  name: string
  normalized: string
}

export interface FuzzyMatch {
  candidate: FuzzyCandidate
  score: number // 0 = perfect, 1 = no match
}

export function findMatches(
  query: string,
  candidates: FuzzyCandidate[],
  threshold = 0.3
): { exact: FuzzyCandidate | null; fuzzy: FuzzyMatch[] } {
  const normalizedQuery = normalizeName(query)

  // Try exact normalized match first
  const exact = candidates.find(c => c.normalized === normalizedQuery) ?? null
  if (exact) return { exact, fuzzy: [] }

  const fuse = new Fuse(candidates, {
    keys: ['normalized'],
    threshold,
    includeScore: true,
  })

  const results = fuse.search(normalizedQuery)
  const fuzzy = results
    .slice(0, 5)
    .map(r => ({ candidate: r.item, score: r.score ?? 1 }))

  return { exact: null, fuzzy }
}
