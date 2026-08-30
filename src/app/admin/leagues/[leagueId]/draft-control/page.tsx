'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { categoryLabel, categoryColor, formatOdds, cn } from '@/lib/utils'

type SortMode = 'odds_asc' | 'odds_desc' | 'first' | 'last'

/** Surname for sorting: last word, ignoring generational suffixes. */
function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1].toLowerCase())) parts.pop()
  return parts[parts.length - 1] ?? fullName
}

/**
 * Which player in the order holds pick `n` (0-based) of a category.
 * Mirrors generateSnakeOrder: rounds restart per category, odd rounds run
 * forward through the order and even rounds run back.
 */
function snakeIndex(n: number, players: number): number {
  if (players <= 0) return 0
  const round = Math.floor(n / players)
  const pos = n % players
  return round % 2 === 0 ? pos : players - 1 - pos
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface EntityRow {
  id: string
  athlete_name: string | null
  school_name: string | null
  conference: string | null
  position: string | null
  odds: number | null
  eligible_categories_json: string[]
}

interface PickRow {
  id: string
  overall_pick_number: number
  round_number: number
  player_user_id: string
  category: string
  locked_odds: number | null
  admin_override: boolean
  draft_segment_id: string
  draftable_entity_id: string
  draftable_entities: {
    athlete_name: string | null
    school_name: string | null
    position: string | null
  } | null
}

interface MemberRow {
  user_id: string
  display_name: string
  draft_position: number | null
  role_in_league: string
}

interface SegmentRow {
  id: string
  category: string
  segment_order: number
  pick_count_per_player: number
}

export default function DraftControlPage() {
  const params = useParams()
  const leagueId = params.leagueId as string

  const [draftData, setDraftData] = useState<{
    draftState: Record<string, unknown> | null
    picks: PickRow[]
    members: MemberRow[]
    entities: EntityRow[]
    segments: SegmentRow[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideEntityId, setOverrideEntityId] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('odds_asc')
  const [nextCategory, setNextCategory] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 4000)
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/draft`)
    if (res.ok) setDraftData(await res.json())
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

  // ── Derived state ─────────────────────────────────────────────────────────
  const ds = draftData?.draftState as {
    status: string
    paused: boolean
    current_overall_pick_number: number
    current_player_user_id: string | null
    current_segment_id: string | null
    updated_at: string
  } | null

  const picks = useMemo(() => draftData?.picks ?? [], [draftData])
  const members = useMemo(() => draftData?.members ?? [], [draftData])
  const entities = useMemo(() => draftData?.entities ?? [], [draftData])
  const segments = useMemo(() => draftData?.segments ?? [], [draftData])

  const orderedPlayers = useMemo(
    () => members
      .filter(m => m.role_in_league === 'player')
      .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99)),
    [members]
  )
  const orderIsSet = orderedPlayers.some(m => m.draft_position != null)
  const playerCount = orderedPlayers.length

  const activeSegment = segments.find(s => s.id === ds?.current_segment_id) ?? null
  const activeCategory = activeSegment?.category ?? null
  const picksPerPlayer = activeSegment?.pick_count_per_player ?? 0

  const picksInCategory = useMemo(
    () => picks.filter(p => p.category === activeCategory),
    [picks, activeCategory]
  )

  const madeInCategory = picksInCategory.length
  const totalInCategory = picksPerPlayer * Math.max(playerCount, 1)
  const currentRound = picksPerPlayer
    ? Math.min(picksPerPlayer, Math.floor(madeInCategory / Math.max(playerCount, 1)) + 1)
    : 0
  const forwardDirection = Math.floor(madeInCategory / Math.max(playerCount, 1)) % 2 === 0

  const totalScheduledPicks = segments.reduce((sum, s) => sum + (s.pick_count_per_player ?? 0), 0) * playerCount

  const onClockId = ds?.current_player_user_id ?? null
  const onClockMember = orderedPlayers.find(m => m.user_id === onClockId) ?? null

  // "Up next" is the holder of the following pick in this category. At the end
  // of a category there is no next pick here - the next game is chosen.
  const upNextMember = useMemo(() => {
    if (!activeSegment || playerCount === 0) return null
    const nextN = madeInCategory + 1
    if (nextN >= totalInCategory) return null
    return orderedPlayers[snakeIndex(nextN, playerCount)] ?? null
  }, [activeSegment, playerCount, madeInCategory, totalInCategory, orderedPlayers])

  const perPlayer = useMemo(() => {
    const map = new Map<string, { made: number; remaining: number; last: PickRow | null }>()
    for (const m of orderedPlayers) {
      const mine = picksInCategory.filter(p => p.player_user_id === m.user_id)
      map.set(m.user_id, {
        made: mine.length,
        remaining: Math.max(0, picksPerPlayer - mine.length),
        last: mine.length ? mine[mine.length - 1] : null,
      })
    }
    return map
  }, [orderedPlayers, picksInCategory, picksPerPlayer])

  const takenInCategory = useMemo(
    () => new Set(picksInCategory.map(p => p.draftable_entity_id)),
    [picksInCategory]
  )

  const availableForCategory = useMemo(() => {
    if (!activeCategory) return []
    const term = entitySearch.trim().toLowerCase()
    return entities
      .filter(e => e.eligible_categories_json?.includes(activeCategory) && !takenInCategory.has(e.id))
      .map(e => ({
        id: e.id,
        name: e.athlete_name ?? e.school_name ?? '—',
        school: e.athlete_name ? e.school_name : e.conference,
        position: e.position,
        odds: e.odds,
      }))
      .filter(e =>
        !term ||
        e.name.toLowerCase().includes(term) ||
        (e.school ?? '').toLowerCase().includes(term) ||
        (e.position ?? '').toLowerCase().includes(term)
      )
      .sort((a, b) => {
        if (sortMode === 'first') return a.name.localeCompare(b.name)
        if (sortMode === 'last') {
          const byLast = surname(a.name).localeCompare(surname(b.name))
          return byLast !== 0 ? byLast : a.name.localeCompare(b.name)
        }
        if (a.odds == null && b.odds == null) return a.name.localeCompare(b.name)
        if (a.odds == null) return 1
        if (b.odds == null) return -1
        const diff = sortMode === 'odds_desc' ? b.odds - a.odds : a.odds - b.odds
        return diff !== 0 ? diff : a.name.localeCompare(b.name)
      })
  }, [entities, activeCategory, takenInCategory, entitySearch, sortMode])

  const selected = availableForCategory.find(e => e.id === overrideEntityId) ?? null

  // If someone else's pick removes the highlighted player, drop the selection
  // rather than letting the admin submit a stale one.
  useEffect(() => {
    if (overrideEntityId && takenInCategory.has(overrideEntityId)) {
      setOverrideEntityId('')
      setConfirmOpen(false)
      showMessage('Your selected player was just drafted. Pick someone else.', 'error')
    }
  }, [takenInCategory, overrideEntityId])

  // Elapsed clock, anchored to the server's draft_state.updated_at, which the
  // update_updated_at trigger refreshes on every advance. No countdown exists
  // in this league (draft_timer_enabled is off) so this is labelled elapsed.
  useEffect(() => {
    if (ds?.status !== 'active' || ds?.paused) return
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [ds?.status, ds?.paused])

  const elapsedSeconds = useMemo(() => {
    if (!ds?.updated_at) return 0
    const started = Date.parse(ds.updated_at)
    if (Number.isNaN(started)) return 0
    return Math.max(0, Math.floor((nowMs - started) / 1000))
  }, [ds?.updated_at, nowMs])

  // Category progress, for the "which game" selector.
  const madeBySegment = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of picks) map.set(p.draft_segment_id, (map.get(p.draft_segment_id) ?? 0) + 1)
    return map
  }, [picks])

  const categoryOptions = useMemo(
    () => segments
      .slice()
      .sort((a, b) => a.segment_order - b.segment_order)
      .map(sgm => {
        const total = sgm.pick_count_per_player * Math.max(playerCount, 1)
        const made = madeBySegment.get(sgm.id) ?? 0
        return { id: sgm.id, category: sgm.category, made, total, done: made >= total }
      }),
    [segments, madeBySegment, playerCount]
  )

  const canChooseCategory = ds?.status !== 'completed' && picksInCategory.length === 0

  // ── Recording a pick ──────────────────────────────────────────────────────
  const openConfirm = () => {
    if (!selected || ds?.paused || ds?.status !== 'active') return
    triggerRef.current = document.activeElement as HTMLButtonElement | null
    setConfirmOpen(true)
  }

  const closeConfirm = useCallback(() => {
    setConfirmOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!confirmOpen) return
    confirmButtonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        closeConfirm()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirmOpen, submitting, closeConfirm])

  const confirmPick = async () => {
    if (!selected || submitting) return
    if (takenInCategory.has(selected.id)) {
      showMessage('That player is no longer available.', 'error')
      setConfirmOpen(false)
      setOverrideEntityId('')
      return
    }

    setSubmitting(true)
    const pickNumber = ds?.current_overall_pick_number ?? 0
    const drafterName = onClockMember?.display_name ?? 'player'

    const res = await fetch(`/api/admin/leagues/${leagueId}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'override',
        entity_id: selected.id,
        ...(overrideReason.trim() ? { reason: overrideReason.trim() } : {}),
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      // Leave the dialog open and the selection intact so it can be retried.
      showMessage(data.error ?? 'Could not record the pick', 'error')
      setAnnouncement(`Pick failed: ${data.error ?? 'unknown error'}`)
      setSubmitting(false)
      return
    }

    const summary = `Pick ${pickNumber}: ${drafterName} selects ${selected.name}` +
      `${selected.position ? `, ${selected.position}` : ''}` +
      `${selected.school ? `, ${selected.school}` : ''}` +
      ` (${formatOdds(selected.odds)}).`

    setConfirmOpen(false)
    setOverrideEntityId('')
    setOverrideReason('')
    setEntitySearch('')
    setAnnouncement(summary)
    showMessage(summary)
    await load()
    setSubmitting(false)
    triggerRef.current?.focus()
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }

  const draftPaused = Boolean(ds?.paused)
  const draftActive = ds?.status === 'active'
  const draftCompleted = ds?.status === 'completed'

  const primaryLabel = !draftActive
    ? 'Draft not running'
    : draftPaused
      ? 'Draft paused'
      : submitting
        ? 'Recording pick…'
        : selected
          ? `Draft ${selected.name}`
          : 'Select a player'

  const primaryDisabled = !draftActive || draftPaused || submitting || !selected

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/admin/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">🎙 Draft Control</h1>
        </div>
      </header>

      {message && (
        <div className={cn(
          'text-center py-2 text-sm font-medium',
          message.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
        )}>
          {message.text}
        </div>
      )}

      {/* Screen-reader announcements for pick results */}
      <div aria-live="polite" role="status" className="sr-only">{announcement}</div>

      <main className="max-w-7xl mx-auto px-4 py-8 grid gap-6 lg:grid-cols-4 items-start">

        {/* ── Left column: status, order, commissioner controls ─────────── */}
        <div className="lg:col-span-1 space-y-6 order-2 lg:order-1">

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Draft Status</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Status</span>
                <Badge variant={draftActive && !draftPaused ? 'amber' : draftCompleted ? 'green' : 'default'}>
                  {ds?.status ?? 'not_started'}{draftPaused ? ' (paused)' : ''}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Pick #</span>
                <span>{ds?.current_overall_pick_number ?? 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">On Clock</span>
                <span>{onClockMember?.display_name ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Picks Made</span>
                <span>{picks.length}</span>
              </div>
            </div>
          </div>

          {/* Live draft queue */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Draft Order</h2>
              {draftActive && activeCategory && (
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {forwardDirection ? '↓ forward' : '↑ reverse'}
                </span>
              )}
            </div>

            {!orderIsSet ? (
              <p className="text-sm text-zinc-500">Not set yet — draw the order below.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {orderedPlayers.map(m => {
                  const stats = perPlayer.get(m.user_id)
                  const isOnClock = draftActive && m.user_id === onClockId
                  const isUpNext = draftActive && !isOnClock && m.user_id === upNextMember?.user_id
                  const isDone = Boolean(activeCategory) && (stats?.remaining ?? 0) === 0

                  return (
                    <li
                      key={m.user_id}
                      className={cn(
                        'rounded-lg px-3 py-2 border transition-colors',
                        isOnClock && 'bg-amber-500/15 border-amber-500/50',
                        isUpNext && 'border-zinc-500 bg-zinc-800/40',
                        !isOnClock && !isUpNext && !isDone && 'border-transparent',
                        isDone && !isOnClock && !isUpNext && 'border-transparent opacity-50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('truncate', isOnClock && 'font-semibold text-amber-300')}>
                          <span className="text-zinc-500 mr-2">{m.draft_position}.</span>
                          {m.display_name}
                        </span>
                        <span className="text-[11px] whitespace-nowrap text-zinc-400">
                          {isOnClock ? 'On the clock'
                            : isUpNext ? 'Up next'
                            : !activeCategory ? ''
                            : isDone ? 'Done'
                            : `${stats?.remaining ?? 0} left`}
                        </span>
                      </div>

                      {stats?.last && (
                        <div className="mt-1 text-xs text-zinc-500 truncate">
                          {stats.last.draftable_entities?.athlete_name ?? stats.last.draftable_entities?.school_name}
                          {stats.last.locked_odds != null && ` · ${formatOdds(stats.last.locked_odds)}`}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          {/* Commissioner controls - unchanged in behaviour */}
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
                  <option value="">Select a category…</option>
                  {categoryOptions.map(c => (
                    <option key={c.id} value={c.category} disabled={c.done}>
                      {categoryLabel(c.category)}{c.done ? ' — drafted' : c.made > 0 ? ` — ${c.made}/${c.total}` : ''}
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

            {draftActive && picksInCategory.length === 0 && (
              <button onClick={() => action({ action: 'set_order', player_ids: orderedPlayers.map(m => m.user_id), randomize: true })}
                className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
                🎲 Draw order for {activeCategory ? categoryLabel(activeCategory) : 'this category'}
              </button>
            )}

            {draftActive && !draftPaused && (
              <button onClick={() => action({ action: 'pause' })}
                className="w-full bg-amber-500/80 hover:bg-amber-500 text-black font-medium py-2 rounded-lg text-sm" disabled={actionLoading}>
                ⏸ Pause Draft
              </button>
            )}

            {(ds?.status === 'paused' || draftPaused) && (
              <button onClick={() => action({ action: 'resume' })}
                className="w-full bg-green-500/80 hover:bg-green-500 text-black font-medium py-2 rounded-lg text-sm" disabled={actionLoading}>
                ▶ Resume Draft
              </button>
            )}

            {(draftActive || ds?.status === 'paused') && picks.length > 0 && (
              <button onClick={() => action({ action: 'undo' })}
                className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
                ↩ Undo Last Pick
              </button>
            )}

            {(draftActive || ds?.status === 'paused') && (
              <div className="flex gap-2">
                <input
                  value={skipReason}
                  onChange={e => setSkipReason(e.target.value)}
                  placeholder="Reason for skip (required)"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
                />
                <button
                  onClick={() => { if (skipReason.trim()) { action({ action: 'skip', reason: skipReason }); setSkipReason('') } }}
                  className="bg-red-500/70 hover:bg-red-500 px-3 py-2 rounded text-sm font-medium"
                  disabled={actionLoading || !skipReason.trim()}
                >
                  Skip
                </button>
              </div>
            )}

            {draftActive && (
              <button onClick={() => action({ action: 'complete' })}
                className="w-full bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-sm font-medium" disabled={actionLoading}>
                ✓ Complete Draft
              </button>
            )}
          </div>
        </div>

        {/* ── Right column: the live draft ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6 order-1 lg:order-2">

          {draftActive && (
            <section
              aria-labelledby="on-the-clock-heading"
              className="bg-zinc-900 border border-amber-500/40 rounded-xl p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p id="on-the-clock-heading" className="text-xs uppercase tracking-[0.2em] text-amber-500/80 font-semibold">
                    On the clock
                  </p>
                  <h2 className="mt-1 text-3xl sm:text-4xl font-bold text-amber-400 truncate">
                    {onClockMember?.display_name ?? 'Unknown player'}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    <span className="text-zinc-200 font-medium">{activeCategory ? categoryLabel(activeCategory) : '—'}</span>
                    {picksPerPlayer > 0 && <> · Round {currentRound} of {picksPerPlayer}</>}
                    {' '}· Pick {ds?.current_overall_pick_number} of {totalScheduledPicks}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {perPlayer.get(onClockId ?? '')?.remaining ?? 0} selection
                    {(perPlayer.get(onClockId ?? '')?.remaining ?? 0) === 1 ? '' : 's'} left in this category
                    {upNextMember && <> · Up next: <span className="text-zinc-300">{upNextMember.display_name}</span></>}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  {activeCategory && <Badge variant={categoryColor(activeCategory)}>{categoryLabel(activeCategory)}</Badge>}
                  <div className={cn(
                    'mt-3 font-mono text-3xl sm:text-4xl tabular-nums',
                    draftPaused ? 'text-zinc-500' : 'text-amber-400'
                  )}>
                    {mmss(elapsedSeconds)}
                  </div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                    {draftPaused ? 'Paused' : 'Time on clock'}
                  </p>
                </div>
              </div>
            </section>
          )}

          {draftCompleted && (
            <section className="bg-zinc-900 border border-green-500/40 rounded-xl p-6">
              <h2 className="text-2xl font-bold text-green-400">Draft complete</h2>
              <p className="text-sm text-zinc-400 mt-1">{picks.length} picks recorded.</p>
            </section>
          )}

          {/* Player board */}
          {draftActive && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap gap-3 items-center justify-between">
                <h2 className="font-semibold">
                  Available <span className="text-zinc-500 font-normal">({availableForCategory.length})</span>
                </h2>
                <div className="flex gap-2 flex-1 min-w-[240px] justify-end">
                  <input
                    value={entitySearch}
                    onChange={e => setEntitySearch(e.target.value)}
                    placeholder="Search name, school, position…"
                    aria-label="Search available players"
                    className="flex-1 max-w-xs bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
                  />
                  <select
                    value={sortMode}
                    onChange={e => setSortMode(e.target.value as SortMode)}
                    aria-label="Sort available players"
                    className="bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
                  >
                    <option value="odds_asc">Odds: favorites first</option>
                    <option value="odds_desc">Odds: longshots first</option>
                    <option value="first">Name: first A–Z</option>
                    <option value="last">Name: last A–Z</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[26rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Player</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">School</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Pos</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Odds</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {availableForCategory.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                          No available players match.
                        </td>
                      </tr>
                    )}
                    {availableForCategory.map(e => {
                      const isSelected = e.id === overrideEntityId
                      return (
                        <tr
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() => setOverrideEntityId(e.id)}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault()
                              setOverrideEntityId(e.id)
                            }
                          }}
                          className={cn(
                            'cursor-pointer transition-colors outline-none',
                            'hover:bg-zinc-800/70 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset',
                            isSelected && 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/60'
                          )}
                        >
                          <td className={cn('px-4 py-2', isSelected ? 'text-amber-200 font-semibold' : 'text-zinc-100')}>
                            {e.name}
                          </td>
                          <td className="px-4 py-2 text-zinc-400">{e.school ?? '—'}</td>
                          <td className="px-4 py-2">
                            {e.position
                              ? <span className="inline-block rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300">{e.position}</span>
                              : <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-400">
                            {formatOdds(e.odds)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Selection summary + primary action */}
              <div className="border-t border-zinc-800 p-4 space-y-3">
                {selected ? (
                  <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-3">
                    <div className="font-semibold text-zinc-100">{selected.name}</div>
                    <div className="text-sm text-zinc-400">
                      {[selected.school, selected.position].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="text-sm text-zinc-400 mt-1">
                      Current odds: <span className="font-mono text-amber-400">{formatOdds(selected.odds)}</span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      Drafting to: <span className="text-zinc-200">{onClockMember?.display_name ?? '—'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Choose a player from the board above.</p>
                )}

                <input
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="Note (optional)"
                  aria-label="Optional note for this pick"
                  className="w-full bg-zinc-800 border border-zinc-700 text-sm rounded px-3 py-2"
                />

                <button
                  onClick={openConfirm}
                  disabled={primaryDisabled}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors"
                >
                  {primaryLabel}
                </button>
              </div>
            </section>
          )}

          {/* Pick History */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="font-semibold">Pick History ({picks.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th scope="col" className="px-4 py-2 text-left font-medium">#</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Player</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Category</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Pick</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">School</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Pos</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Odds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {picks.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No picks yet.</td></tr>
                  )}
                  {picks.map(pick => {
                    const player = members.find(m => m.user_id === pick.player_user_id)
                    const ent = pick.draftable_entities
                    return (
                      <tr key={pick.id} className={pick.admin_override ? 'bg-yellow-500/5' : ''}>
                        <td className="px-4 py-2 text-zinc-400">{pick.overall_pick_number}</td>
                        <td className="px-4 py-2">{player?.display_name}</td>
                        <td className="px-4 py-2">
                          <Badge variant={categoryColor(pick.category)}>{categoryLabel(pick.category)}</Badge>
                        </td>
                        <td className="px-4 py-2">{ent?.athlete_name ?? ent?.school_name ?? '—'}</td>
                        <td className="px-4 py-2 text-zinc-400">{ent?.athlete_name ? ent?.school_name ?? '—' : '—'}</td>
                        <td className="px-4 py-2 text-zinc-400">{ent?.position ?? '—'}</td>
                        <td className="px-4 py-2 text-right font-mono text-amber-400">{formatOdds(pick.locked_odds)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* Confirmation dialog */}
      {confirmOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-pick-title"
            className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4"
          >
            <h2 id="confirm-pick-title" className="text-lg font-bold text-zinc-100">
              Draft {selected.name} to {onClockMember?.display_name ?? 'this player'}?
            </h2>

            <div className="text-sm text-zinc-400 space-y-1">
              <p>{[selected.school, selected.position, formatOdds(selected.odds)].filter(Boolean).join(' · ')}</p>
              <p>
                {activeCategory ? categoryLabel(activeCategory) : '—'} · Overall pick {ds?.current_overall_pick_number}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeConfirm}
                disabled={submitting}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 py-2 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                ref={confirmButtonRef}
                onClick={confirmPick}
                disabled={submitting}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold py-2 rounded-lg text-sm"
              >
                {submitting ? 'Recording pick…' : 'Confirm pick'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
