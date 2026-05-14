import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireLeagueMember } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { formatOdds, formatPoints, categoryLabel, categoryColor } from '@/lib/utils'

export default async function WarChestPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) redirect('/login')

  const supabase = await createServiceClient()

  const { data: picks } = await supabase
    .from('draft_picks')
    .select('*, draftable_entities(*), scores(*)')
    .eq('league_id', leagueId)
    .eq('player_user_id', user.id)
    .order('overall_pick_number')

  const { data: league } = await supabase
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .single()

  // Group by category
  const cats = ['heisman', 'cfp', 'cinderella', 'conference_champion'] as const
  const byCategory = cats.map(cat => ({
    cat,
    picks: (picks ?? []).filter((p: { category: string }) => p.category === cat),
  }))

  const totalPoints = (picks ?? []).reduce((sum: number, p: { scores: Array<{ points: number; published: boolean }> }) => {
    const score = p.scores?.[0]
    return score?.published ? sum + score.points : sum
  }, 0)

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <div>
            <h1 className="font-bold">My War Chest</h1>
            <p className="text-xs text-zinc-400">{league?.name}</p>
          </div>
          {totalPoints > 0 && (
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold text-amber-400">{formatPoints(totalPoints)}</div>
              <div className="text-xs text-zinc-400">total pts</div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {byCategory.map(({ cat, picks: catPicks }) => (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
              <Badge variant={categoryColor(cat)}>{categoryLabel(cat)}</Badge>
              <span className="text-sm text-zinc-400">{catPicks.length} picks</span>
            </div>

            {catPicks.length === 0 ? (
              <div className="px-4 py-4 text-zinc-500 text-sm">No picks yet</div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {catPicks.map((pick: {
                  id: string
                  draftable_entities: { athlete_name: string | null; school_name: string | null; conference: string | null; position: string | null }
                  locked_odds: number | null
                  scores: Array<{ points: number; outcome: string | null; published: boolean; calculation_json: { formula: string; lowest_drafted_odds: number | null } }>
                }) => {
                  const score = pick.scores?.[0]
                  return (
                    <div key={pick.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {pick.draftable_entities?.athlete_name ?? pick.draftable_entities?.school_name}
                          </div>
                          <div className="text-xs text-zinc-400 flex gap-2 mt-0.5">
                            {pick.draftable_entities?.school_name && pick.draftable_entities?.athlete_name && (
                              <span>{pick.draftable_entities.school_name}</span>
                            )}
                            {pick.draftable_entities?.conference && <span>{pick.draftable_entities.conference}</span>}
                            {pick.draftable_entities?.position && <span>{pick.draftable_entities.position}</span>}
                            <span>Odds: {formatOdds(pick.locked_odds)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {score?.published ? (
                            <div>
                              <div className="font-bold text-amber-400">{formatPoints(score.points)} pts</div>
                              <div className="text-xs text-zinc-400">{score.outcome?.replace(/_/g, ' ')}</div>
                            </div>
                          ) : (
                            <span className="text-zinc-500 text-xs">Pending</span>
                          )}
                        </div>
                      </div>
                      {score?.published && score.calculation_json && (
                        <div className="mt-2 text-xs text-zinc-500 bg-zinc-800/50 rounded px-3 py-2">
                          Formula: {score.calculation_json.formula}
                          {score.calculation_json.lowest_drafted_odds && (
                            <span className="ml-2">(lowest odds in pool: {formatOdds(score.calculation_json.lowest_drafted_odds)})</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  )
}
