import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export default async function AuditLogPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const admin = await requireAdmin()
  if (!admin) redirect('/login')

  const supabase = await createServiceClient()

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, users:actor_user_id(display_name, email)')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/admin/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">📋 Audit Log</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {(logs ?? []).length === 0 ? (
            <div className="py-8 text-center text-zinc-500">No audit entries yet.</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {(logs ?? []).map((log: {
                id: string
                action: string
                entity_type: string
                entity_id: string
                created_at: string
                before_json: Record<string, unknown> | null
                after_json: Record<string, unknown> | null
                users: { display_name: string; email: string } | null
              }) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-amber-400 text-xs bg-amber-500/10 px-2 py-0.5 rounded">{log.action}</code>
                        <span className="text-xs text-zinc-500">{log.entity_type}:{log.entity_id.slice(0, 8)}</span>
                      </div>
                      <div className="text-xs text-zinc-400">
                        by {log.users?.display_name ?? 'Unknown'}
                        {log.before_json && (
                          <span className="ml-2 text-zinc-600">Before: {JSON.stringify(log.before_json).slice(0, 60)}</span>
                        )}
                        {log.after_json && (
                          <span className="ml-2 text-zinc-600">After: {JSON.stringify(log.after_json).slice(0, 60)}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
