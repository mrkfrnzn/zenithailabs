import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { leagueStatusLabel } from '@/lib/utils'

export default async function AdminLeagueOverviewPage({
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
    .select('*, league_members(*, users(id, email, display_name)), draft_state(*), draft_segments(*), scoring_configs(*)')
    .eq('id', leagueId)
    .single()

  if (!league) redirect('/admin')

  const members = league.league_members ?? []
  const draftState = Array.isArray(league.draft_state) ? league.draft_state[0] : league.draft_state

  const adminLinks = [
    { href: `/admin/leagues/${leagueId}/import`, label: '📥 Import Preseason Data', show: true },
    { href: `/admin/leagues/${leagueId}/draft-setup`, label: '⚙️ Draft Setup & Scoring Config', show: true },
    { href: `/admin/leagues/${leagueId}/draft-control`, label: '🎙 Draft Control', show: ['draft_ready', 'drafting'].includes(league.status) },
    { href: `/admin/leagues/${leagueId}/results`, label: '📊 Upload Results & Score', show: ['drafted', 'scoring', 'completed'].includes(league.status) },
    { href: `/admin/leagues/${leagueId}/standings-review`, label: '🏆 Standings Review', show: ['scoring', 'completed'].includes(league.status) },
    { href: `/admin/leagues/${leagueId}/audit`, label: '📋 Audit Log', show: true },
  ].filter(l => l.show)

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin" className="text-zinc-400 hover:text-zinc-200 text-sm">← Admin</Link>
          <div>
            <h1 className="font-bold">{league.name}</h1>
            <p className="text-xs text-zinc-400">{league.season_year} Season</p>
          </div>
          <Badge variant="amber" className="ml-auto">{leagueStatusLabel(league.status)}</Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-3">
        {/* Admin Actions */}
        <div className="sm:col-span-2 space-y-3">
          <h2 className="font-semibold text-zinc-400 text-sm uppercase tracking-wider">Actions</h2>
          {adminLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="block bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 hover:border-zinc-600 transition-colors font-medium"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Members */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4">Members ({members.filter((m: { role_in_league: string }) => m.role_in_league === 'player').length})</h2>
          <div className="space-y-3">
            {members.map((m: {
              id: string
              user_id: string
              display_name: string
              invite_status: string
              role_in_league: string
              draft_position: number | null
              users: { email: string }
            }) => (
              <div key={m.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.display_name}</span>
                  <Badge variant={m.invite_status === 'accepted' ? 'green' : 'default'} className="text-[10px]">
                    {m.invite_status}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500">{m.users?.email}</div>
              </div>
            ))}
          </div>
          <InviteForm leagueId={leagueId} />
        </div>
      </main>
    </div>
  )
}

function InviteForm({ leagueId }: { leagueId: string }) {
  return (
    <div className="mt-4 pt-4 border-t border-zinc-800">
      <p className="text-xs text-zinc-400 mb-2">Invite a player</p>
      <form
        action={async (formData: FormData) => {
          'use server'
          const res = await fetch('/api/auth/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: formData.get('email'),
              display_name: formData.get('display_name'),
              league_id: leagueId,
            }),
          })
        }}
        className="space-y-2"
      >
        <input name="display_name" placeholder="Display name" required
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email" required
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" />
        <button type="submit"
          className="w-full bg-amber-500 text-black font-bold py-2 rounded text-sm hover:bg-amber-400">
          Send Invite
        </button>
      </form>
    </div>
  )
}
