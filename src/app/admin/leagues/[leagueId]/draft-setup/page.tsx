import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { leagueStatusLabel } from '@/lib/utils'
import { ScoringEditor } from './ScoringEditor'
import type { Category, ScoringConfigData } from '@/types'

const EDITABLE_STATUSES = ['setup', 'data_imported', 'draft_ready']

export default async function DraftSetupPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const admin = await requireAdmin()
  if (!admin) redirect('/login')

  const supabase = await createServiceClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('*, scoring_configs(*), draft_segments(*)')
    .eq('id', leagueId)
    .single()

  if (!league) redirect('/admin')

  const settings = (league.settings_json ?? {}) as {
    draft_segment_order?: Category[]
    pick_counts?: Record<string, number>
  }

  const scoringConfigs = (league.scoring_configs ?? []) as Array<{
    category: Category
    config_json: ScoringConfigData
    locked: boolean
  }>
  const segments = (league.draft_segments ?? []) as Array<{
    category: Category
    segment_order: number
    pick_count_per_player: number
  }>

  // Category order: settings.draft_segment_order, else derive from segment_order.
  const categories: Category[] =
    settings.draft_segment_order && settings.draft_segment_order.length > 0
      ? settings.draft_segment_order
      : [...segments].sort((a, b) => a.segment_order - b.segment_order).map(s => s.category)

  const pickCounts: Record<string, number> = {}
  for (const s of segments) pickCounts[s.category] = s.pick_count_per_player
  // Fall back to settings pick_counts for any category without a segment row.
  for (const [cat, n] of Object.entries(settings.pick_counts ?? {})) {
    if (pickCounts[cat] == null) pickCounts[cat] = n
  }

  const editable = EDITABLE_STATUSES.includes(league.status)

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/admin/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <div>
            <h1 className="font-bold">⚙️ Draft Setup &amp; Scoring Config</h1>
            <p className="text-xs text-zinc-400">{league.name} · {league.season_year} Season</p>
          </div>
          <Badge variant="amber" className="ml-auto">{leagueStatusLabel(league.status)}</Badge>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-sm text-zinc-400 mb-6">
          Tune the point values, multipliers, bonuses, and picks-per-player for each
          category. Changes lock automatically once the draft starts.
        </p>

        <ScoringEditor
          leagueId={leagueId}
          editable={editable}
          categories={categories}
          configs={scoringConfigs}
          pickCounts={pickCounts}
        />
      </main>
    </div>
  )
}
