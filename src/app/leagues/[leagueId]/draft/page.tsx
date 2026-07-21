'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { formatOdds, categoryLabel, categoryColor, cn } from '@/lib/utils'
import type { DraftableEntity, DraftPick, LeagueMember, DraftState, Category } from '@/types'

interface DraftData {
  draftState: DraftState | null
  picks: Array<DraftPick & { draftable_entities: DraftableEntity }>
  entities: DraftableEntity[]
  members: Array<LeagueMember & { users: { id: string; email: string; display_name: string } }>
}

export default function DraftRoomPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.leagueId as string

  const [data, setData] = useState<DraftData | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all')
  const [filterConference, setFilterConference] = useState<string>('all')

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/draft`)
    if (!res.ok) {
      if (res.status === 401) router.push('/login')
      return
    }
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [leagueId, router])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
    })

    loadData()

    // Realtime subscription
    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'draft_state',
        filter: `league_id=eq.${leagueId}`,
      }, () => loadData())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'draft_picks',
        filter: `league_id=eq.${leagueId}`,
      }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, loadData])

  const submitPick = async (entityId: string) => {
    setSubmitting(true)
    const res = await fetch(`/api/leagues/${leagueId}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId }),
    })
    const json = await res.json()
    if (!res.ok) {
      showToast(json.error || 'Pick failed')
    } else {
      showToast('Pick submitted!', 'success')
      await loadData()
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading draft room…</div>
      </div>
    )
  }

  const { draftState, picks, entities, members } = data!
  const isOnClock = draftState?.current_player_user_id === currentUserId && draftState?.status === 'active' && !draftState?.paused

  const pickedEntityIds = new Set(
    picks
      .filter(p => p.category === draftState?.current_segment_id) // will refine below
      .map(p => p.draftable_entity_id)
  )

  // Get active category from current segment — we need to look it up
  const activeCategory = picks.length > 0
    ? picks[picks.length - 1]?.category // fallback
    : null

  // Build set of picked entity IDs per category for exclusivity
  const pickedByCat: Record<string, Set<string>> = {}
  for (const pick of picks) {
    if (!pickedByCat[pick.category]) pickedByCat[pick.category] = new Set()
    pickedByCat[pick.category].add(pick.draftable_entity_id)
  }

  // Filter available pool
  const conferences = Array.from(new Set(entities.map(e => e.conference).filter(Boolean))) as string[]

  const availableEntities = entities.filter(e => {
    // Must be in active segment category
    if (draftState?.status === 'active') {
      // We determine active category from draft state current_segment_id
      // For simplicity, show all entities not yet picked in any category they belong to
    }

    // Exclusivity: if already picked in their category, hide
    for (const cat of e.eligible_categories_json) {
      if (pickedByCat[cat]?.has(e.id)) return false
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      const name = (e.athlete_name ?? e.school_name ?? '').toLowerCase()
      if (!name.includes(q)) return false
    }

    // Category filter
    if (filterCategory !== 'all' && !e.eligible_categories_json.includes(filterCategory)) return false

    // Conference filter
    if (filterConference !== 'all' && e.conference !== filterConference) return false

    return true
  })

  const currentDrafter = members.find(m => m.user_id === draftState?.current_player_user_id)

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <span className="font-bold text-lg">🏈 Draft Room</span>
        {draftState?.status === 'active' && !draftState.paused && (
          <Badge variant="amber" className="animate-pulse">LIVE</Badge>
        )}
        {draftState?.paused && <Badge variant="red">PAUSED</Badge>}
        {draftState?.status === 'completed' && <Badge variant="green">COMPLETE</Badge>}
        {draftState?.status === 'not_started' && <Badge variant="default">NOT STARTED</Badge>}
        <span className="text-zinc-400 text-sm ml-auto">Pick #{draftState?.current_overall_pick_number}</span>
      </header>

      {/* On-clock banner */}
      {isOnClock && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
          <p className="font-bold text-amber-400 text-center">
            ⏰ You're on the clock! Make your pick below.
          </p>
        </div>
      )}
      {!isOnClock && draftState?.status === 'active' && currentDrafter && (
        <div className="bg-zinc-800/50 border-b border-zinc-800 px-4 py-2">
          <p className="text-center text-sm text-zinc-300">
            Waiting for <strong>{currentDrafter.display_name}</strong> to pick…
          </p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg font-medium text-sm',
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-black'
        )}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-1 max-w-7xl mx-auto w-full gap-0 sm:gap-4 px-0 sm:px-4 py-4">
        {/* Available Pool */}
        <div className="flex-1 min-w-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="font-semibold mb-3">Available Pool</h2>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 min-w-32 bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value as Category | 'all')}
                  className="bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-3 py-2"
                >
                  <option value="all">All Categories</option>
                  {Array.from(
                    new Set((data?.entities ?? []).flatMap(e => e.eligible_categories_json))
                  ).map(c => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
                <select
                  value={filterConference}
                  onChange={e => setFilterConference(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-3 py-2"
                >
                  <option value="all">All Conferences</option>
                  {conferences.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="divide-y divide-zinc-800 overflow-y-auto max-h-[60vh]">
              {availableEntities.length === 0 ? (
                <div className="py-8 text-center text-zinc-500">No entities match your filters</div>
              ) : (
                availableEntities.map(entity => (
                  <div key={entity.id} className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {entity.athlete_name ?? entity.school_name}
                      </div>
                      <div className="text-xs text-zinc-400 flex gap-2 flex-wrap mt-0.5">
                        {entity.school_name && entity.athlete_name && (
                          <span>{entity.school_name}</span>
                        )}
                        {entity.conference && <span>{entity.conference}</span>}
                        {entity.preseason_rank && <span>#{entity.preseason_rank}</span>}
                        {entity.eligible_categories_json.map(cat => (
                          <Badge key={cat} variant={categoryColor(cat)} className="text-[10px] py-0">
                            {categoryLabel(cat)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono text-amber-400">{formatOdds(entity.odds)}</div>
                      {isOnClock && (
                        <button
                          onClick={() => submitPick(entity.id)}
                          disabled={submitting}
                          className="mt-1 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded hover:bg-amber-400 disabled:opacity-50"
                        >
                          Pick
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Draft Board */}
        <div className="w-72 shrink-0 hidden lg:block">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="font-semibold">Pick History</h2>
            </div>
            <div className="divide-y divide-zinc-800 overflow-y-auto max-h-[70vh]">
              {picks.length === 0 ? (
                <div className="py-6 text-center text-zinc-500 text-sm">No picks yet</div>
              ) : (
                [...picks].reverse().map(pick => {
                  const player = members.find(m => m.user_id === pick.player_user_id)
                  return (
                    <div key={pick.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-zinc-500">#{pick.overall_pick_number}</span>
                        <Badge variant={categoryColor(pick.category)} className="text-[10px] py-0">
                          {categoryLabel(pick.category)}
                        </Badge>
                      </div>
                      <div className="text-sm font-medium">
                        {pick.draftable_entities?.athlete_name ?? pick.draftable_entities?.school_name}
                      </div>
                      <div className="text-xs text-zinc-400">{player?.display_name}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
