'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { categoryLabel, categoryColor, formatOdds } from '@/lib/utils'

export default function DraftControlPage() {
  const params = useParams()
  const leagueId = params.leagueId as string
  const [draftData, setDraftData] = useState<{
    draftState: Record<string, unknown> | null
    picks: Array<Record<string, unknown>>
    members: Array<Record<string, unknown>>
    entities: Array<Record<string, unknown>>
    segments: Array<Record<string, unknown>>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideEntityId, setOverrideEntityId] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/draft`)
    if (res.ok) {
      setDraftData(await res.json())
    }
    setLoading(false)
  }, [leagueId])

  useEffect(() => {
    load()
    const supabase = createClient()
    const channel = supabase
      .channel(`admin-draft:${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_state', filter: `league_id=eq.${leagueId}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `league_id=eq.${leagueId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId, load])

  const action = async (body: Record<string, unknown>) => {
    setActionLoading(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) showMessage(data.error ?? 'Action failed', 'error')
    else { showMessage('Done'); await load() }
    setActionLoading(false)
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>

  const { draftState, picks, members, entities, segments } = draftData!
  const ds = draftState as {
    status: string
    paused: boolean
    current_overall_pick_number: number
    current_player_user_id: string
    current_segment_id: string
  } | null
  const currentPlayer = (members as Array<{ user_id: string; display_name: string }>)?.find(m => m.user_id === ds?.current_player_user_id)
  const totalPicks = (picks as Array<unknown>)?.length ?? 0

  const activeSegment = (segments as Array<{ id: string; category: string }> | undefined)?.find(
    s => s.id === ds?.current_segment_id
  )
  const activeCategory = activeSegment?.category ?? null

  // Entities eligible for the live category that nobody has taken in it yet.
  const takenInCategory = new Set(
    ((picks ?? []) as Array<{ draftable_entity_id: string; category: string }>)
      .filter(p => p.category === activeCategory)
      .map(p => p.draftable_entity_id)
  )

  const availableForCategory = !activeCategory
    ? []
    : ((entities ?? []) as Array<{
        id: string
        athlete_name: string | null
        school_name: string | null
        conference: string | null
        odds: number | null
        eligible_categories_json: string[]
      }>)
        .filter(e => e.eligible_categories_json?.includes(activeCategory) && !takenInCategory.has(e.id))
        .map(e => {
          const name = e.athlete_name ?? e.school_name ?? '-'
          const parts = [name]
          if (e.athlete_name && e.school_name) parts.push('(' + e.school_name + ')')
          if (e.conference) parts.push('- ' + e.conference)
          if (e.odds != null) parts.push('- ' + formatOdds(e.odds))
          return { id: e.id, label: parts.join(' '), name }
        })
        .filter(e => e.label.toLowerCase().includes(entitySearch.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/admin/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">🎙 Draft Control</h1>
        </div>
      </header>

      {message && (
        <div className={`text-center py-2 text-sm font-medium ${message.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-2">
        {/* Status */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Draft Status</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Status</span>
              <Badge variant={ds?.status === 'active' ? 'amber' : ds?.status === 'completed' ? 'green' : 'default'}>
                {ds?.status ?? 'not_started'}{ds?.paused ? ' (paused)' : ''}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Pick #</span>
              <span>{ds?.current_overall_pick_number ?? 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">On Clock</span>
              <span>{currentPlayer?.display_name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Picks Made</span>
              <span>{totalPicks}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold mb-4">Controls</h2>

          {ds?.status === 'not_started' && (
            <>
              <button onClick={() => action({ action: 'set_order', player_ids: (members as Array<{ user_id: string }>).map(m => m.user_id), randomize: true })}
                className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
                🎲 Randomize Draft Order
              </button>
              <button onClick={() => action({ action: 'lock_pool' })}
                className="w-full bg-blue-500/80 hover:bg-blue-500 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
                🔒 Lock Draft Pool
              </button>
              <button onClick={() => action({ action: 'start' })}
                className="w-full bg-amber-500 text-black font-bold py-2 rounded-lg text-sm" disabled={actionLoading}>
                ▶ Start Draft
              </button>
            </>
          )}

          {ds?.status === 'active' && !ds.paused && (
            <button onClick={() => action({ action: 'pause' })}
              className="w-full bg-yellow-500/80 hover:bg-yellow-500 text-black py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
              ⏸ Pause Draft
            </button>
          )}

          {(ds?.status === 'paused' || ds?.paused) && (
            <button onClick={() => action({ action: 'resume' })}
              className="w-full bg-green-500/80 hover:bg-green-500 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
              ▶ Resume Draft
            </button>
          )}

          {(ds?.status === 'active' || ds?.status === 'paused') && totalPicks > 0 && (
            <button onClick={() => action({ action: 'undo' })}
              className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
              ↩ Undo Last Pick
            </button>
          )}

          {(ds?.status === 'active' || ds?.status === 'paused') && (
            <>
              <div className="flex gap-2">
                <input
                  value={skipReason}
                  onChange={e => setSkipReason(e.target.value)}
                  placeholder="Reason for skip (required)"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
                />
                <button
                  onClick={() => { if (skipReason.trim()) { action({ action: 'skip', reason: skipReason }); setSkipReason('') } }}
                  className="bg-red-500/70 hover:bg-red-500 px-3 py-2 rounded text-sm font-medium" disabled={actionLoading || !skipReason.trim()}
                >
                  Skip
                </button>
              </div>
            </>
          )}

          {ds?.status === 'active' && (
            <button onClick={() => action({ action: 'complete' })}
              className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
              ✓ Complete Draft
            </button>
          )}
        </div>

        {/* On the Clock - admin records the pick called out on the call */}
        {ds?.status === 'active' && (
          <div className="sm:col-span-2 bg-zinc-900 border border-amber-500/40 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">On the Clock</h2>
              {activeCategory && (
                <Badge variant={categoryColor(activeCategory)}>{categoryLabel(activeCategory)}</Badge>
              )}
            </div>

            <div className="text-xl font-bold text-amber-400">
              {currentPlayer?.display_name ?? 'Unknown player'}
              <span className="ml-2 text-sm font-normal text-zinc-400">
                pick #{ds.current_overall_pick_number}
              </span>
            </div>

            <input
              value={entitySearch}
              onChange={e => setEntitySearch(e.target.value)}
              placeholder="Search available..."
              className="w-full bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
            />

            <select
              value={overrideEntityId}
              onChange={e => setOverrideEntityId(e.target.value)}
              size={10}
              className="w-full bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
            >
              {availableForCategory.length === 0 && <option value="">No entities available</option>}
              {availableForCategory.map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>

            <div className="text-xs text-zinc-500">{availableForCategory.length} available</div>

            <input
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="Reason (e.g. called on Zoom)"
              className="w-full bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
            />

            <button
              onClick={() => {
                if (!overrideEntityId || !overrideReason.trim()) return
                action({ action: 'override', entity_id: overrideEntityId, reason: overrideReason.trim() })
                setOverrideEntityId('')
                setEntitySearch('')
              }}
              disabled={actionLoading || !overrideEntityId || !overrideReason.trim()}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold py-3 rounded-lg"
            >
              Record Pick
            </button>
          </div>
        )}

        {/* Pick History */}
        <div className="sm:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="font-semibold">Pick History ({totalPicks})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Player</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-left">Pick</th>
                  <th className="px-4 py-2 text-right">Odds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(picks as Array<{
                  id: string
                  overall_pick_number: number
                  player_user_id: string
                  category: string
                  locked_odds: number | null
                  admin_override: boolean
                  draftable_entities: { athlete_name: string | null; school_name: string | null }
                }>).map(pick => {
                  const player = (members as Array<{ user_id: string; display_name: string }>).find(m => m.user_id === pick.player_user_id)
                  return (
                    <tr key={pick.id} className={pick.admin_override ? 'bg-yellow-500/5' : ''}>
                      <td className="px-4 py-2 text-zinc-400">{pick.overall_pick_number}</td>
                      <td className="px-4 py-2">{player?.display_name}</td>
                      <td className="px-4 py-2">
                        <Badge variant={categoryColor(pick.category) as 'amber' | 'blue' | 'purple' | 'green'}>{categoryLabel(pick.category)}</Badge>
                        {pick.admin_override && <span className="ml-1 text-xs text-yellow-400">Override</span>}
                      </td>
                      <td className="px-4 py-2">{pick.draftable_entities?.athlete_name ?? pick.draftable_entities?.school_name}</td>
                      <td className="px-4 py-2 text-right font-mono text-amber-400">{formatOdds(pick.locked_odds)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
