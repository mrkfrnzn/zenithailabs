import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { leagueStatusLabel, categoryLabel } from '@/lib/utils'

export default async function LeaguesPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: memberships } = await supabase
    .from('league_members')
    .select('league_id, display_name, role_in_league, leagues(id, name, season_year, status, settings_json)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const leagues = (memberships ?? []).map((m: Record<string, unknown>) => {
    const league = m.leagues as Record<string, unknown>
    return { ...league, membership: m }
  })

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏈</span>
            <span className="font-bold text-lg">CFB War Chest</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">{user.display_name}</span>
            {user.role === 'admin' && (
              <Link href="/admin" className="text-sm text-amber-400 hover:text-amber-300">
                Admin →
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Your Leagues</h1>

        {leagues.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg">You haven't been added to any leagues yet.</p>
            <p className="mt-2 text-sm">Check your email for an invite from your commissioner.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {leagues.map((rawLeague: Record<string, unknown>) => {
              const league = rawLeague as {
                id: string; name: string; season_year: number; status: string
                settings_json: Record<string, unknown>
                membership: Record<string, unknown>
              }
              return (
                <Link
                  key={league.id}
                  href={`/leagues/${league.id}`}
                  className="block bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="font-semibold text-lg">{league.name}</h2>
                      <p className="text-zinc-400 text-sm">{league.season_year} Season</p>
                    </div>
                    {!!league.settings_json?.is_archive && (
                      <Badge variant="default">Archive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={league.status} />
                    {league.membership?.role_in_league === 'admin' && (
                      <Badge variant="amber">Commissioner</Badge>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'amber' | 'green' | 'blue'> = {
    setup: 'default',
    data_imported: 'blue',
    draft_ready: 'amber',
    drafting: 'amber',
    drafted: 'green',
    scoring: 'green',
    completed: 'green',
  }
  return <Badge variant={variants[status] ?? 'default'}>{leagueStatusLabel(status)}</Badge>
}
