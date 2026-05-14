import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireLeagueMember } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { formatOdds, categoryLabel, categoryColor } from '@/lib/utils'

export default async function DraftBoardPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) redirect('/login')

  const supabase = await createServiceClient()

  const [{ data: picks }, { data: members }, { data: league }] = await Promise.all([
    supabase
      .from('draft_picks')
      .select('*, draftable_entities(*)')
      .eq('league_id', leagueId)
      .order('overall_pick_number'),
    supabase
      .from('league_members')
      .select('user_id, display_name, draft_position')
      .eq('league_id', leagueId)
      .eq('role_in_league', 'player')
      .order('draft_position'),
    supabase.from('leagues').select('name, status').eq('id', leagueId).single(),
  ])

  // Group by round
  const rounds: Record<number, typeof picks> = {}
  for (const pick of picks ?? []) {
    if (!rounds[pick.round_number]) rounds[pick.round_number] = []
    rounds[pick.round_number]!.push(pick)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">{league?.name} — Draft Board</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 overflow-x-auto">
        {Object.keys(rounds).length === 0 ? (
          <p className="text-center text-zinc-400 py-8">No picks yet.</p>
        ) : (
          Object.entries(rounds).map(([round, roundPicks]) => (
            <div key={round} className="mb-6">
              <h2 className="text-sm font-semibold text-zinc-400 mb-2">Round {round}</h2>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${(members ?? []).length}, minmax(140px, 1fr))` }}>
                {(members ?? []).map((m: { user_id: string; display_name: string }) => {
                  const pick = (roundPicks ?? []).find((p: { player_user_id: string }) => p.player_user_id === m.user_id)
                  return (
                    <div key={m.user_id} className={`border rounded-lg p-3 min-h-16 ${pick ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-900/30 border-zinc-800'}`}>
                      {pick ? (
                        <>
                          <div className="text-xs mb-1">
                            <Badge variant={categoryColor(pick.category) as 'amber' | 'blue' | 'purple' | 'green'} className="text-[10px] py-0">
                              {categoryLabel(pick.category)}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium leading-tight">
                            {pick.draftable_entities?.athlete_name ?? pick.draftable_entities?.school_name}
                          </div>
                          <div className="text-xs text-amber-400 mt-1">{formatOdds(pick.locked_odds)}</div>
                        </>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
