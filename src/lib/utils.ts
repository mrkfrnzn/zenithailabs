import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatOdds(odds: number | null): string {
  if (odds == null) return '—'
  return odds > 0 ? `+${odds}` : `${odds}`
}

export function formatPoints(points: number): string {
  return points % 1 === 0 ? points.toString() : points.toFixed(1)
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    heisman: 'Heisman',
    cfp: 'CFP',
    cinderella: 'Cinderella',
    conference_champion: 'Conf. Champion',
  }
  return labels[cat] ?? cat
}

export function categoryColor(cat: string): 'amber' | 'blue' | 'purple' | 'green' {
  const colors: Record<string, 'amber' | 'blue' | 'purple' | 'green'> = {
    heisman: 'amber',
    cfp: 'blue',
    cinderella: 'purple',
    conference_champion: 'green',
  }
  return colors[cat] ?? 'amber'
}

export function leagueStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    setup: 'Setup',
    data_imported: 'Data Imported',
    draft_ready: 'Draft Ready',
    drafting: 'Drafting',
    drafted: 'Draft Complete',
    scoring: 'Scoring',
    completed: 'Season Complete',
  }
  return labels[status] ?? status
}
