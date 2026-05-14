/**
 * Player draft pick submission endpoint.
 * Serialized server-side: first commit wins on concurrent submissions.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { generateSnakeOrder } from '@/lib/draft/snake'
import { writeAuditLog } from '@/lib/audit'
import { sendOnClockEmail } from '@/lib/email'
import { z } from 'zod'
import { Category } from '@/types'

const PickSchema = z.object({
  entity_id: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const body = await request.json()
  const parsed = PickSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { entity_id } = parsed.data
  const supabase = await createServiceClient()

  // Use a transaction-like approach: re-read draft_state under service role
  const { data: draftState } = await supabase
    .from('draft_state')
    .select('*')
    .eq('league_id', leagueId)
    .single()

  if (!draftState || draftState.status !== 'active' || draftState.paused) {
    return NextResponse.json({ error: 'Draft is not active' }, { status: 409 })
  }

  // Enforce: must be current drafter
  if (draftState.current_player_user_id !== user.id) {
    return NextResponse.json({ error: 'Not your pick' }, { status: 403 })
  }

  // Get active segment
  const { data: segment } = await supabase
    .from('draft_segments')
    .select('*')
    .eq('id', draftState.current_segment_id)
    .single()

  if (!segment) return NextResponse.json({ error: 'No active segment' }, { status: 409 })

  const category = segment.category as Category

  // Validate entity: must exist, be in correct category, not already picked in this category
  const { data: entity } = await supabase
    .from('draftable_entities')
    .select('*')
    .eq('id', entity_id)
    .eq('league_id', leagueId)
    .single()

  if (!entity) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

  if (!entity.eligible_categories_json.includes(category)) {
    return NextResponse.json({
      error: `This pick is not eligible for category: ${category}`,
      eligible: entity.eligible_categories_json,
    }, { status: 422 })
  }

  // Per-category exclusivity check
  const { data: existingPick } = await supabase
    .from('draft_picks')
    .select('id')
    .eq('league_id', leagueId)
    .eq('draftable_entity_id', entity_id)
    .eq('category', category)
    .limit(1)
    .single()

  if (existingPick) {
    return NextResponse.json({ error: 'Already drafted in this category' }, { status: 409 })
  }

  // Insert the pick
  const { data: pick, error: pickError } = await supabase
    .from('draft_picks')
    .insert({
      league_id: leagueId,
      draft_segment_id: segment.id,
      round_number: Math.ceil(draftState.current_overall_pick_number / 1), // calc from schedule
      overall_pick_number: draftState.current_overall_pick_number,
      player_user_id: user.id,
      draftable_entity_id: entity_id,
      category,
      locked_odds: entity.odds,
      admin_override: false,
    })
    .select()
    .single()

  if (pickError) {
    if (pickError.code === '23505') {
      return NextResponse.json({ error: 'Pick number already taken (concurrent pick conflict)' }, { status: 409 })
    }
    return NextResponse.json({ error: pickError.message }, { status: 500 })
  }

  // Advance draft state
  await advanceDraftState(supabase, leagueId, draftState.current_overall_pick_number + 1, leagueId)

  return NextResponse.json(pick, { status: 201 })
}

async function advanceDraftState(
  supabase: ReturnType<typeof createServiceClient> extends Promise<infer T> ? T : never,
  leagueId: string,
  nextPickNumber: number,
  _league_id: string
) {
  // Get ordered players and segments
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, draft_position, display_name, users(email)')
    .eq('league_id', leagueId)
    .eq('role_in_league', 'player')
    .not('draft_position', 'is', null)
    .order('draft_position')

  const { data: segments } = await supabase
    .from('draft_segments')
    .select('*')
    .eq('league_id', leagueId)
    .order('segment_order')

  if (!members || !segments) return

  const playerIds = members.map((m: { user_id: string }) => m.user_id)
  const schedule = generateSnakeOrder(
    playerIds,
    segments.map((s: { id: string; category: string; pick_count_per_player: number }) => ({
      draft_segment_id: s.id,
      category: s.category as Category,
      pick_count_per_player: s.pick_count_per_player,
    }))
  )

  const nextPick = schedule.find(p => p.overall_pick_number === nextPickNumber)

  if (!nextPick) {
    // Draft is complete
    await supabase.from('draft_state').update({ status: 'completed' }).eq('league_id', leagueId)
    await supabase.from('leagues').update({ status: 'drafted' }).eq('id', leagueId)
    return
  }

  // Update segment status
  const currentSegmentId = schedule.find(p => p.overall_pick_number === nextPickNumber - 1)?.draft_segment_id
  if (currentSegmentId !== nextPick.draft_segment_id) {
    await supabase.from('draft_segments').update({ status: 'completed' }).eq('id', currentSegmentId!)
    await supabase.from('draft_segments').update({ status: 'active' }).eq('id', nextPick.draft_segment_id)
  }

  await supabase.from('draft_state').update({
    current_overall_pick_number: nextPickNumber,
    current_player_user_id: nextPick.player_user_id,
    current_segment_id: nextPick.draft_segment_id,
  }).eq('league_id', leagueId)

  // Send on-clock email
  const onClockMember = members.find((m: { user_id: string }) => m.user_id === nextPick.player_user_id)
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

// GET: return current draft state + all picks
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const supabase = await createServiceClient()

  const [{ data: draftState }, { data: picks }, { data: entities }, { data: members }] =
    await Promise.all([
      supabase.from('draft_state').select('*').eq('league_id', leagueId).single(),
      supabase.from('draft_picks').select('*, draftable_entities(*)').eq('league_id', leagueId).order('overall_pick_number'),
      supabase.from('draftable_entities').select('*').eq('league_id', leagueId),
      supabase.from('league_members').select('*, users(id, email, display_name)').eq('league_id', leagueId),
    ])

  return NextResponse.json({ draftState, picks, entities, members })
}
