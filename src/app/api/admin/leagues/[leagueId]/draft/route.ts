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

    // Each category is drafted as its own mini-draft with a freshly drawn order.
    // Reshuffling is only safe at a category boundary: the snake schedule is
    // rebuilt from draft_position on every advance, so changing it once picks
    // exist in the live category would reorder that category mid-flight.
    const midDraft = league.status === 'drafting'
    if (midDraft) {
      const { data: ds } = await supabase
        .from('draft_state').select('current_segment_id, current_overall_pick_number')
        .eq('league_id', leagueId).single()

      if (ds?.current_segment_id) {
        const { data: seg } = await supabase
          .from('draft_segments').select('category').eq('id', ds.current_segment_id).single()

        if (seg) {
          const { count } = await supabase
            .from('draft_picks')
            .select('id', { count: 'exact', head: true })
            .eq('league_id', leagueId)
            .eq('category', seg.category)

          if ((count ?? 0) > 0) {
            return NextResponse.json({
              error: 'Picks have already been made in this category. Finish it before drawing a new order.',
            }, { status: 409 })
          }
        }
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

    if (midDraft) {
      // Re-point the clock at whoever now holds the current pick number.
      const schedule = await buildSchedule(supabase, leagueId)
      const { data: ds } = await supabase
        .from('draft_state').select('current_overall_pick_number')
        .eq('league_id', leagueId).single()
      const current = schedule.find(p => p.overall_pick_number === ds?.current_overall_pick_number)
      if (current) {
        await supabase.from('draft_state').update({
          current_player_user_id: current.player_user_id,
          current_segment_id: current.draft_segment_id,
        }).eq('league_id', leagueId)
      }
    } else {
      await supabase.from('leagues').update({ status: 'draft_ready' }).eq('id', leagueId)
    }

    await writeAuditLog({ league_id: leagueId, actor_user_id: admin.id, action: 'set_draft_order', entity_type: 'league', entity_id: leagueId, after_json: { order: orderedIds, mid_draft: midDraft } })
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

  // -- OVERRIDE (admin records the pick for whoever is on the clock) --------
  if (action === 'override') {
    const { entity_id, reason } = parsed.data as { action: 'override'; entity_id: string; reason: string }

    const { data: draftState } = await supabase
      .from('draft_state').select('*').eq('league_id', leagueId).single()

    if (!draftState || draftState.status !== 'active') {
      return NextResponse.json({ error: 'Draft is not active' }, { status: 409 })
    }
    if (!draftState.current_player_user_id || !draftState.current_segment_id) {
      return NextResponse.json({ error: 'No player is on the clock' }, { status: 409 })
    }

    const { data: segment } = await supabase
      .from('draft_segments').select('*').eq('id', draftState.current_segment_id).single()
    if (!segment) return NextResponse.json({ error: 'No active segment' }, { status: 409 })

    const category = segment.category as Category

    const { data: entity } = await supabase
      .from('draftable_entities').select('*').eq('id', entity_id).eq('league_id', leagueId).single()
    if (!entity) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

    if (!entity.eligible_categories_json.includes(category)) {
      return NextResponse.json({
        error: 'Not eligible for the active category: ' + category,
        eligible: entity.eligible_categories_json,
      }, { status: 422 })
    }

    const { data: existingPick } = await supabase
      .from('draft_picks').select('id')
      .eq('league_id', leagueId)
      .eq('draftable_entity_id', entity_id)
      .eq('category', category)
      .maybeSingle()

    if (existingPick) {
      return NextResponse.json({ error: 'Already drafted in this category' }, { status: 409 })
    }

    const schedule = await buildSchedule(supabase, leagueId)
    const scheduled = schedule.find(p => p.overall_pick_number === draftState.current_overall_pick_number)

    const { data: pick, error: pickError } = await supabase
      .from('draft_picks')
      .insert({
        league_id: leagueId,
        draft_segment_id: segment.id,
        round_number: scheduled?.round_number ?? 1,
        overall_pick_number: draftState.current_overall_pick_number,
        player_user_id: draftState.current_player_user_id,
        draftable_entity_id: entity_id,
        category,
        locked_odds: entity.odds,
        admin_override: true,
      })
      .select()
      .single()

    if (pickError) {
      if (pickError.code === '23505') {
        return NextResponse.json({ error: 'Pick number already taken (concurrent pick conflict)' }, { status: 409 })
      }
      return NextResponse.json({ error: pickError.message }, { status: 500 })
    }

    await writeAuditLog({
      league_id: leagueId,
      actor_user_id: admin.id,
      action: 'override_pick',
      entity_type: 'draft_pick',
      entity_id: pick.id,
      after_json: { reason, on_behalf_of: draftState.current_player_user_id, entity_id, category },
    })

    await advanceDraftState(supabase, leagueId, draftState.current_overall_pick_number + 1)
    return NextResponse.json(pick, { status: 201 })
  }

  // -- SKIP (advance past the current pick without recording one) -----------
  if (action === 'skip') {
    const { reason } = parsed.data as { action: 'skip'; reason: string }

    const { data: draftState } = await supabase
      .from('draft_state').select('*').eq('league_id', leagueId).single()

    if (!draftState || draftState.status !== 'active') {
      return NextResponse.json({ error: 'Draft is not active' }, { status: 409 })
    }

    await writeAuditLog({
      league_id: leagueId,
      actor_user_id: admin.id,
      action: 'skip_pick',
      entity_type: 'league',
      entity_id: leagueId,
      after_json: {
        reason,
        skipped_pick_number: draftState.current_overall_pick_number,
        player_user_id: draftState.current_player_user_id,
      },
    })

    await advanceDraftState(supabase, leagueId, draftState.current_overall_pick_number + 1)
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


type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Rebuild the full snake schedule for a league from its members and segments. */
async function buildSchedule(supabase: ServiceClient, leagueId: string) {
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, draft_position')
    .eq('league_id', leagueId)
    .eq('role_in_league', 'player')
    .not('draft_position', 'is', null)
    .order('draft_position')

  const { data: segments } = await supabase
    .from('draft_segments')
    .select('*')
    .eq('league_id', leagueId)
    .order('segment_order')

  if (!members || !segments) return []

  return generateSnakeOrder(
    members.map((m: { user_id: string }) => m.user_id),
    segments.map((s: { id: string; category: string; pick_count_per_player: number }) => ({
      draft_segment_id: s.id,
      category: s.category as Category,
      pick_count_per_player: s.pick_count_per_player,
    }))
  )
}

/**
 * Move the draft to nextPickNumber. Mirrors the player-side advance in
 * /api/leagues/[leagueId]/draft so an admin-entered pick behaves identically:
 * roll the segment over when the category changes, mark the draft complete when
 * the schedule runs out, and notify the next player (best effort).
 */
async function advanceDraftState(supabase: ServiceClient, leagueId: string, nextPickNumber: number) {
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, display_name, users(email)')
    .eq('league_id', leagueId)
    .eq('role_in_league', 'player')
    .not('draft_position', 'is', null)
    .order('draft_position')

  const schedule = await buildSchedule(supabase, leagueId)
  const nextPick = schedule.find(p => p.overall_pick_number === nextPickNumber)

  if (!nextPick) {
    await supabase.from('draft_state').update({ status: 'completed' }).eq('league_id', leagueId)
    await supabase.from('leagues').update({ status: 'drafted' }).eq('id', leagueId)
    return
  }

  const prevSegmentId = schedule.find(p => p.overall_pick_number === nextPickNumber - 1)?.draft_segment_id
  if (prevSegmentId && prevSegmentId !== nextPick.draft_segment_id) {
    await supabase.from('draft_segments').update({ status: 'completed' }).eq('id', prevSegmentId)
    await supabase.from('draft_segments').update({ status: 'active' }).eq('id', nextPick.draft_segment_id)
  }

  await supabase.from('draft_state').update({
    current_overall_pick_number: nextPickNumber,
    current_player_user_id: nextPick.player_user_id,
    current_segment_id: nextPick.draft_segment_id,
  }).eq('league_id', leagueId)

  const onClockMember = (members ?? []).find((m: { user_id: string }) => m.user_id === nextPick.player_user_id)
  if (onClockMember) {
    const emailData = onClockMember as { display_name?: string; users?: { email?: string } }
    sendOnClockEmail({
      email: emailData.users?.email ?? '',
      display_name: emailData.display_name ?? '',
      league_id: leagueId,
      pick_number: nextPickNumber,
    }).catch(console.error)
  }
}
