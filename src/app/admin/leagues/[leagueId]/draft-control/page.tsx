'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { categoryLabel, categoryColor, formatOdds } from '@/lib/utils'

/** Surname for sorting: last word, ignoring generational suffixes. */
function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1].toLowerCase())) parts.pop()
  return parts[parts.length - 1] ?? fullName
}

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
  const [sortMode, setSortMode] = useState<'odds_asc' | 'odds_desc' | 'first' | 'last'>('odds_asc')
  const [nextCategory, setNextCategory] = useState('')
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

  // Lock the pool and start in a single press - lock_pool is a precondition of
  // start, so there is no reason to make the commissioner run them separately.
  const startDraft = async () => {
    setActionLoading(true)
    const post = async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/leagues/${leagueId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { ok: res.ok, data: await res.json() }
    }

    const locked = await post({ action: 'lock_pool' })
    if (!locked.ok) {
      showMessage(locked.data.error ?? 'Could not lock the draft pool', 'error')
      setActionLoading(false)
      return
    }

    const started = await post({ action: 'start' })
    if (!started.ok) {
      showMessage(started.data.error ?? 'Could not start the draft', 'error')
      setActionLoading(false)
      return
    }

    showMessage('Draft started')
    await load()
    setActionLoading(false)
  }

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

  const totalScheduledPicks = ((segments ?? []) as Array<{ pick_count_per_player: number }>)
    .reduce((sum, sgm) => sum + (sgm.pick_count_per_player ?? 0), 0) *
    ((members ?? []) as Array<{ role_in_league: string }>).filter(m => m.role_in_league === 'player').length

  const orderedPlayers = ((members ?? []) as Array<{
    user_id: string
    display_name: string
    draft_position: number | null
    role_in_league: string
  }>)
    .filter(m => m.role_in_league === 'player')
    .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))

  const orderIsSet = orderedPlayers.some(m => m.draft_position != null)

  // Picks already made in the live category, per player.
  const picksInCategory = ((picks ?? []) as Array<{ player_user_id: string; category: string }>)
    .filter(p => p.category === activeCategory)

  const picksPerPlayer = (activeSegment as { pick_count_per_player?: number } | undefined)?.pick_count_per_player ?? 0
  const currentRound = picksPerPlayer
    ? Math.min(picksPerPlayer, Math.floor(picksInCategory.length / Math.max(orderedPlayers.length, 1)) + 1)
    : 0

  const remainingByPlayer = new Map<string, number>()
  for (const m of orderedPlayers) {
    const made = picksInCategory.filter(p => p.player_user_id === m.user_id).length
    remainingByPlayer.set(m.user_id, Math.max(0, picksPerPlayer - made))
  }

  // Progress per category, for the "which game are we drafting" selector.
  const madeBySegment = new Map<string, number>()
  for (const p of ((picks ?? []) as Array<{ draft_segment_id: string }>)) {
    madeBySegment.set(p.draft_segment_id, (madeBySegment.get(p.draft_segment_id) ?? 0) + 1)
  }

  const categoryOptions = ((segments ?? []) as Array<{
    id: string
    category: string
    segment_order: number
    pick_count_per_player: number
  }>)
    .slice()
    .sort((a, b) => a.segment_order - b.segment_order)
    .map(sgm => {
      const total = sgm.pick_count_per_player * Math.max(orderedPlayers.length, 1)
      const made = madeBySegment.get(sgm.id) ?? 0
      return { id: sgm.id, category: sgm.category, made, total, done: made >= total }
    })

  const canChooseCategory = ds?.status !== 'completed' && picksInCategory.length === 0

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
          return { id: e.id, label: parts.join(' '), name, odds: e.odds }
        })
        .filter(e => e.label.toLowerCase().includes(entitySearch.toLowerCase()))
        .sort((a, b) => {
          if (sortMode === 'first') return a.name.localeCompare(b.name)
          if (sortMode === 'last') {
            const byLast = surname(a.name).localeCompare(surname(b.name))
            return byLast !== 0 ? byLast : a.name.localeCompare(b.name)
          }
          // Odds sorts: entities without a price (Cinderella) always sit last.
          if (a.odds == null && b.odds == null) return a.name.localeCompare(b.name)
          if (a.odds == null) return 1
          if (b.odds == null) return -1
          const diff = sortMode === 'odds_desc' ? b.odds - a.odds : a.odds - b.odds
          return diff !== 0 ? diff : a.name.localeCompare(b.name)
        })

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

      <main className="max-w-7xl mx-auto px-4 py-8 grid gap-6 lg:grid-cols-4 items-start">
        <div className="lg:col-span-1 space-y-6">
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

        {/* Draft Order */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Draft Order</h2>
          {!orderIsSet ? (
            <p className="text-sm text-zinc-500">Not set yet — press Randomize Draft Order.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {orderedPlayers.map(m => {
                const onClock = m.user_id === ds?.current_player_user_id
                return (
                  <li
                    key={m.user_id}
                    className={`flex items-center justify-between rounded px-2 py-1 ${onClock ? 'bg-amber-500/15 text-amber-300 font-semibold' : ''}`}
                  >
                    <span>
                      <span className="text-zinc-500 mr-2">{m.draft_position}.</span>
                      {m.display_name}
                    </span>
                    {activeCategory && (
                      <span className="text-xs text-zinc-400">
                        {remainingByPlayer.get(m.user_id) ?? 0} left
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold mb-4">Controls</h2>

          {canChooseCategory && (
            <div className="space-y-2 pb-3 mb-3 border-b border-zinc-800">
              <label className="block text-xs uppercase tracking-wider text-zinc-500">1. Choose the game</label>
              <select
                value={nextCategory || activeCategory || ''}
                onChange={e => setNextCategory(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
              >
                <option value="">Select a category...</option>
                {categoryOptions.map(c => (
                  <option key={c.id} value={c.category} disabled={c.done}>
                    {categoryLabel(c.category)}{c.done ? ' - drafted' : c.made > 0 ? ` - ${c.made}/${c.total}` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => action({ action: 'set_category', category: nextCategory })}
                disabled={actionLoading || !nextCategory}
                className="w-full bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium"
              >
                Set game
              </button>
            </div>
          )}

          {ds?.status === 'not_started' && (
            <>
              <label className="block text-xs uppercase tracking-wider text-zinc-500">2. Draw the order</label>
              <button onClick={() => action({ action: 'set_order', player_ids: orderedPlayers.map(m => m.user_id), randomize: true })}
                className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
                🎲 Randomize Draft Order
              </button>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 pt-2">3. Go</label>
              <button onClick={startDraft}
                className="w-full bg-amber-500 text-black font-bold py-2 rounded-lg text-sm disabled:opacity-40"
                disabled={actionLoading || !orderIsSet}>
                ▶ Lock Pool &amp; Start Draft
              </button>
              {!orderIsSet && (
                <p className="text-xs text-zinc-500 text-center">Randomize the draft order first.</p>
              )}
            </>
          )}

          {ds?.status === 'active' && picksInCategory.length === 0 && (
            <button onClick={() => action({ action: 'set_order', player_ids: orderedPlayers.map(m => m.user_id), randomize: true })}
              className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
              🎲 Draw order for {activeCategory ? categoryLabel(activeCategory) : 'this category'}
            </button>
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

        </div>

        <div className="lg:col-span-3 space-y-6">
        {/* On the Clock - admin records the pick called out on the call */}
        {ds?.status === 'active' && (
          <div className="bg-zinc-900 border border-amber-500/40 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">On the Clock</h2>
              {activeCategory && (
                <Badge variant={categoryColor(activeCategory)}>{categoryLabel(activeCategory)}</Badge>
              )}
            </div>

            <div className="text-xl font-bold text-amber-400">
              {currentPlayer?.display_name ?? 'Unknown player'}
              <span className="ml-2 text-sm font-normal text-zinc-400">
                overall pick #{ds.current_overall_pick_number} of {totalScheduledPicks}
              </span>
            </div>

            <div className="text-sm text-zinc-400">
              Drafting <span className="text-zinc-200 font-medium">{activeCategory ? categoryLabel(activeCategory) : '—'}</span>
              {picksPerPlayer > 0 && (
                <> · round <span className="text-zinc-200 font-medium">{currentRound}</span> of {picksPerPlayer}</>
              )}
              {' '}· <span className="text-zinc-200 font-medium">{remainingByPlayer.get(ds.current_player_user_id) ?? 0}</span> left for {currentPlayer?.display_name ?? 'this player'} in this category
            </div>

            <div className="flex gap-2">
              <input
                value={entitySearch}
                onChange={e => setEntitySearch(e.target.value)}
                placeholder="Search available..."
                className="flex-1 bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
              />
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as 'odds_asc' | 'odds_desc' | 'first' | 'last')}
                className="bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
              >
                <option value="odds_asc">Odds: favorites first</option>
                <option value="odds_desc">Odds: longshots first</option>
                <option value="first">Name: first A-Z</option>
                <option value="last">Name: last A-Z</option>
              </select>
            </div>

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
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
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
        </div>
      </main>
    </div>
  )
}
