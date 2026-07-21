import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { leagueStatusLabel } from '@/lib/utils'

export default async function AdminDashboard() {
  const admin = await requireAdmin()
  if (!admin) redirect('/login')

  const supabase = await createServiceClient()
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, season_year, status, settings_json, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏈</span>
            <span className="font-bold">CFB War Chest — Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/leagues" className="text-sm text-zinc-400 hover:text-zinc-200">Player View</Link>
            <span className="text-sm text-zinc-400">{admin.display_name}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">All Leagues</h1>
          <Link
            href="/admin/leagues/new"
            className="bg-amber-500 text-black font-bold px-4 py-2 rounded-lg hover:bg-amber-400"
          >
            + Create League
          </Link>
        </div>

        {(leagues ?? []).length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <p>No leagues yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(leagues ?? []).map((league: {
              id: string
              name: string
              season_year: number
              status: string
              settings_json: { is_archive?: boolean }
            }) => (
              <Link
                key={league.id}
                href={`/admin/leagues/${league.id}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="font-semibold text-lg">{league.name}</h2>
                    <p className="text-zinc-400 text-sm">{league.season_year} Season</p>
                  </div>
                  {league.settings_json?.is_archive && <Badge>Archive</Badge>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={league.status} />
                </div>
              </Link>
            ))}
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
