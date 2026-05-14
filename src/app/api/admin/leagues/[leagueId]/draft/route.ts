/**
 * Admin draft control endpoint.
 * Actions: start, pause, resume, undo, override, skip, complete, lock_pool, set_order
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { generateSnakeOrder } from '@/lib/draft/snake'
import { writeAuditLog } from '@/lib/audit'
import { sendOnClockEmail } from '@/lib/email'
import { z } from 'zod'
import { Category } from '@/types'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lock_pool') }),
  z.object({ action: z.literal('set_order'), player_ids: z.array(z.string().uuid()), randomize: z.boolean().optional() }),
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('undo') }),
  z.object({ action: z.literal('skip'), reason: z.string().min(1) }),
  z.object({ action: z.literal('override'), entity_id: z.string().uuid(), reason: z.string().min(1) }),
  z.object({ action: z.literal('complete') }),
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const body = await request.json()
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const supabase = await createServiceClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('*, settings_json, draft_state(*), draft_segments(*), league_members(*, users(*))')
    .eq('id', leagueId)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  const draftState = Array.isArray(league.draft_state) ? league.draft_state[0] : league.draft_state
  const segments: Array<{ id: string; category: Category; segment_order: number; pick_count_per_player: number }> =
    league.draft_segments

  const action = parsed.data.action

  // ── LOCK POOL ─────────────────────────────────────────────────────────────
  if (action === 'lock_pool') {
    if (!['data_imported', 'draft_ready'].includes(league.status)) {
      return NextResponse.json({ error: 'Can only lock pool from data_imported or draft_ready status' }, { status: 409 })
    }

    // Check player count
    const players = league.league_members.filter((m: { role_in_league: string }) => m.role_in_league === 'player')
    const settings = league.settings_json
    if (players.length < 3) {
      return NextResponse.json({ error: 'Add at least 3 players before locking the draft pool' }, { status: 409 })
    }

    // Check all entities have odds
    const { data: missingOdds } = await supabase
      .from('draftable_entities')
      .select('id, normalized_name, eligible_categories_json')
      .eq('league_id', leagueId)
      .is('odds', null)

    const nonCinderella = (missingOdds ?? []).filter(
      (e: { eligible_categories_json: string[] }) => !e.eligible_categories_json.includes('cinderella')
    )
    if (nonCinderella.length > 0) {
      return NextResponse.json({
        error: 'Some entities are missing odds — fix or delete them before locking',
        entities: nonCinderella,
      }, { status: 409 })
    }

    // Lock all entities and scoring configs
    await supabase.from('draftable_entities').update({ locked: true }).eq('league_id', leagueId)
    await supabase.from('scoring_configs').update({ locked: true }).eq('league_id', leagueId)
    await supabase.from('leagues').update({ status: 'draft_ready' }).eq('id', leagueId)

    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'lock_pool', entity_type: 'league', entity_id: leagueId, after_json: { status: 'draft_ready' } })
    return NextResponse.json({ success: true })
  }

  // ── SET ORDER ─────────────────────────────────────────────────────────────
  if (action === 'set_order') {
    const data = parsed.data as { action: 'set_order'; player_ids: string[]; randomize?: boolean }
    let orderedIds = data.player_ids

    if (data.randomize) {
      for (let i = orderedIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderedIds[i], orderedIds[j]] = [orderedIds[j], orderedIds[i]]
      }
    }

    await Promise.all(
      orderedIds.map((uid, idx) =>
        supabase.from('league_members')
          .update({ draft_position: idx + 1 })
          .eq('league_id', leagueId)
          .eq('user_id', uid)
      )
    )

    await supabase.from('leagues').update({ status: 'draft_ready' }).eq('id', leagueId)
    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'set_draft_order', entity_type: 'league', entity_id: leagueId, after_json: { order: orderedIds } })
    return NextResponse.json({ success: true, order: orderedIds })
  }

  // ── START ─────────────────────────────────────────────────────────────────
  if (action === 'start') {
    if (league.status !== 'draft_ready') {
      return NextResponse.json({ error: 'League must be in draft_ready status to start' }, { status: 409 })
    }

    const players = league.league_members
      .filter((m: { role_in_league: string; draft_position: number | null }) => m.role_in_league === 'player' && m.draft_position != null)
      .sort((a: { draft_position: number }, b: { draft_position: number }) => a.draft_position - b.draft_position)

    if (players.length === 0) {
      return NextResponse.json({ error: 'Set draft order before starting' }, { status: 409 })
    }

    const sortedSegments = [...segments].sort((a, b) => a.segment_order - b.segment_order)
    const firstSegment = sortedSegments[0]
    const pickOrder = generateSnakeOrder(
      players.map((p: { user_id: string }) => p.user_id),
      sortedSegments.map(s => ({
        draft_segment_id: s.id,
        category: s.category as Category,
        pick_count_per_player: s.pick_count_per_player,
      }))
    )

    const firstPick = pickOrder[0]

    await supabase.from('draft_segments').update({ status: 'active' }).eq('id', firstSegment.id)
    await supabase.from('draft_state').update({
      status: 'active',
      current_segment_id: firstSegment.id,
      current_overall_pick_number: 1,
      current_player_user_id: firstPick.player_user_id,
      paused: false,
    }).eq('league_id', leagueId)
    await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId)

    // Send on-clock email
    const onClockPlayer = players.find((p: { user_id: string }) => p.user_id === firstPick.player_user_id)
    if (onClockPlayer) {
      sendOnClockEmail({
        email: onClockPlayer.users.email,
        display_name: onClockPlayer.display_name,
        league_id: leagueId,
        pick_number: 1,
      }).catch(console.error)
    }

    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'start_draft', entity_type: 'league', entity_id: leagueId })
    return NextResponse.json({ success: true })
  }

  // ── PAUSE ─────────────────────────────────────────────────────────────────
  if (action === 'pause') {
    await supabase.from('draft_state').update({ paused: true, status: 'paused' }).eq('league_id', leagueId)
    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'pause_draft', entity_type: 'league', entity_id: leagueId })
    return NextResponse.json({ success: true })
  }

  // ── RESUME ────────────────────────────────────────────────────────────────
  if (action === 'resume') {
    await supabase.from('draft_state').update({ paused: false, status: 'active' }).eq('league_id', leagueId)
    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'resume_draft', entity_type: 'league', entity_id: leagueId })
    return NextResponse.json({ success: true })
  }

  // ── UNDO ──────────────────────────────────────────────────────────────────
  if (action === 'undo') {
    const { data: lastPick } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('league_id', leagueId)
      .order('overall_pick_number', { ascending: false })
      .limit(1)
      .single()

    if (!lastPick) return NextResponse.json({ error: 'No picks to undo' }, { status: 409 })

    await supabase.from('draft_picks').delete().eq('id', lastPick.id)
    await supabase.from('draft_state').update({
      current_overall_pick_number: lastPick.overall_pick_number,
      current_player_user_id: lastPick.player_user_id,
      current_segment_id: lastPick.draft_segment_id,
    }).eq('league_id', leagueId)

    await writeAuditLog({
      league_id: leagueId,
      actor_user_id: admin.id,
      action: 'undo_pick',
      entity_type: 'draft_pick',
      entity_id: lastPick.id,
      before_json: lastPick,
    })
    return NextResponse.json({ success: true })
  }

  // ── COMPLETE ──────────────────────────────────────────────────────────────
  if (action === 'complete') {
    await supabase.from('draft_state').update({ status: 'completed' }).eq('league_id', leagueId)
    await supabase.from('leagues').update({ status: 'drafted' }).eq('id', leagueId)
    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'complete_draft', entity_type: 'league', entity_id: leagueId })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
