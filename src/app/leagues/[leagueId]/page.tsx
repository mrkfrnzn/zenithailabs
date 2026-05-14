import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { requireLeagueMember } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { leagueStatusLabel, categoryLabel, categoryColor } from '@/lib/utils'

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) redirect('/login')

  const supabase = await createServiceClient()

  const [{ data: league }, { data: members }, { data: picks }] = await Promise.all([
    supabase
      .from('leagues')
      .select('*, draft_state(*), draft_segments(*)')
      .eq('id', leagueId)
      .single(),
    supabase
      .from('league_members')
      .select('user_id, display_name, draft_position')
      .eq('league_id', leagueId)
      .eq('role_in_league', 'player')
      .order('draft_position'),
    supabase
      .from('draft_picks')
      .select('player_user_id, category')
      .eq('league_id', leagueId)
      .eq('player_user_id', user.id),
  ])

  if (!league) redirect('/leagues')

  const draftState = Array.isArray(league.draft_state) ? league.draft_state[0] : league.draft_state

  const navLinks = [
    { href: `/leagues/${leagueId}/draft`, label: '📋 Draft Room', show: ['draft_ready', 'drafting'].includes(league.status) },
    { href: `/leagues/${leagueId}/draft-board`, label: '🗂 Draft Board', show: ['drafting', 'drafted', 'scoring', 'completed'].includes(league.status) },
    { href: `/leagues/${leagueId}/war-chest`, label: '🏆 My War Chest', show: ['drafted', 'scoring', 'completed', 'drafting'].includes(league.status) },
    { href: `/leagues/${leagueId}/standings`, label: '📊 Standings', show: ['scoring', 'completed', 'drafted'].includes(league.status) },
    { href: `/leagues/${leagueId}/trash-talk`, label: '💬 Trash Talk', show: !!league.settings_json?.trash_talk_enabled },
  ].filter(l => l.show)

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/leagues" className="text-zinc-400 hover:text-zinc-200 text-sm">← Leagues</Link>
          <div>
            <h1 className="font-bold">{league.name}</h1>
            <p className="text-xs text-zinc-400">{league.season_year} Season</p>
          </div>
          <Badge variant={league.status === 'drafting' ? 'amber' : 'default'} className="ml-auto">
            {leagueStatusLabel(league.status)}
          </Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* On-clock banner */}
        {league.status === 'drafting' && draftState?.current_player_user_id === user.id && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/50 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-amber-400 text-lg">⏰ You're on the clock!</p>
              <p className="text-zinc-300 text-sm">It's your turn to make a pick.</p>
            </div>
            <Link
              href={`/leagues/${leagueId}/draft`}
              className="bg-amber-500 text-black font-bold px-6 py-2 rounded-lg hover:bg-amber-400"
            >
              Make Pick →
            </Link>
          </div>
        )}

        {/* Nav cards */}
        <div className="grid gap-3 sm:grid-cols-2 mb-8">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition-colors font-medium"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Members */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">League Members</h2>
          <div className="divide-y divide-zinc-800">
            {(members ?? []).map((m: { user_id: string; display_name: string; draft_position: number | null }) => (
              <div key={m.user_id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {m.draft_position != null && (
                    <span className="w-6 h-6 bg-zinc-800 rounded-full text-xs flex items-center justify-center text-zinc-400">
                      {m.draft_position}
                    </span>
                  )}
                  <span>{m.display_name}</span>
                  {m.user_id === user.id && <Badge variant="amber">You</Badge>}
                </div>
                {league.status === 'drafting' && draftState?.current_player_user_id === m.user_id && (
                  <Badge variant="amber">On Clock</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
