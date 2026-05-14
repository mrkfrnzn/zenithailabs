import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireLeagueMember } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { buildStandings, MemberInput, ScoredPickInput } from '@/lib/scoring/standings'
import { Badge } from '@/components/ui/badge'
import { categoryLabel, formatPoints } from '@/lib/utils'

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) redirect('/login')

  const supabase = await createServiceClient()

  const [{ data: members }, { data: scores }, { data: league }, { data: publishedImports }] =
    await Promise.all([
      supabase
        .from('league_members')
        .select('user_id, display_name')
        .eq('league_id', leagueId)
        .eq('role_in_league', 'player'),
      supabase
        .from('scores')
        .select('*, draft_picks(*, draftable_entities(*))')
        .eq('league_id', leagueId)
        .eq('published', true),
      supabase.from('leagues').select('name, settings_json').eq('id', leagueId).single(),
      supabase
        .from('result_imports')
        .select('result_type, status, created_at')
        .eq('league_id', leagueId)
        .eq('status', 'published'),
    ])

  const allScores = (scores ?? []) as Array<Record<string, unknown>>
  const milestones = {
    conference_champion: (publishedImports ?? []).some((i: Record<string, unknown>) => i.result_type === 'conference_champion'),
    cinderella: (publishedImports ?? []).some((i: Record<string, unknown>) => i.result_type === 'cinderella'),
    heisman: (publishedImports ?? []).some((i: Record<string, unknown>) => i.result_type === 'heisman'),
    cfp: (publishedImports ?? []).some((i: Record<string, unknown>) => i.result_type === 'cfp'),
  }

  const standings = buildStandings(
    (members ?? []) as MemberInput[],
    allScores.map(s => ({
      pick: (s.draft_picks as Record<string, unknown>) ?? {},
      score: s,
    })) as ScoredPickInput[]
  )

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">{league?.name} — Standings</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Milestone progress */}
        <div className="flex gap-3 flex-wrap mb-8">
          {Object.entries(milestones).map(([cat, done]) => (
            <div key={cat} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border ${done ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-zinc-700 bg-zinc-800 text-zinc-500'}`}>
              {done ? '✓' : '○'} {categoryLabel(cat)}
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-500 mb-6">
          As of {new Date().toLocaleString()}
          {allScores.length === 0 && ' — no scores published yet'}
        </p>

        {standings.length === 0 ? (
          <p className="text-zinc-400 text-center py-8">No standings yet — check back after results are published.</p>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="text-left px-4 py-3 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium">Player</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Heisman</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">CFP</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Cinderella</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Conf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {standings.map(row => (
                  <tr key={row.player_user_id} className={`hover:bg-zinc-800/50 ${row.player_user_id === user.id ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3 font-bold text-zinc-400">{row.rank}</td>
                    <td className="px-4 py-3 font-medium">
                      {row.display_name}
                      {row.player_user_id === user.id && <span className="ml-2 text-xs text-amber-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-400">{formatPoints(row.total_points)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 hidden sm:table-cell">{formatPoints(row.heisman_points)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 hidden sm:table-cell">{formatPoints(row.cfp_points)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 hidden sm:table-cell">{formatPoints(row.cinderella_points)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 hidden md:table-cell">{formatPoints(row.conference_champion_points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
