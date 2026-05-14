import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { DEFAULT_SCORING_CONFIGS } from '@/lib/scoring/engine'
import { z } from 'zod'
import { Category } from '@/types'

const CreateLeagueSchema = z.object({
  name: z.string().min(1).max(100),
  season_year: z.number().int().min(2024).max(2030),
  max_players: z.number().int().min(3).max(8).default(6),
  conferences: z.array(z.string()).min(1),
})

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateLeagueSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { name, season_year, max_players, conferences } = parsed.data

  const defaultSettings = {
    max_players,
    conferences,
    pick_counts: { heisman: 4, cfp: 4, cinderella: 4, conference_champion: 3 * conferences.length },
    cinderella_ap_threshold: 25,
    draft_timer_enabled: false,
    draft_timer_seconds: 90,
    draft_timer_on_expiry: 'pause',
    draft_segment_order: ['heisman', 'cfp', 'cinderella', 'conference_champion'],
    trash_talk_enabled: true,
    allow_provisional_visibility: false,
    is_archive: false,
  }

  const supabase = await createServiceClient()

  const { data: league, error } = await supabase
    .from('leagues')
    .insert({ name, season_year, settings_json: defaultSettings, created_by: admin.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add admin as league member
  await supabase.from('league_members').insert({
    league_id: league.id,
    user_id: admin.id,
    display_name: admin.display_name,
    role_in_league: 'admin',
    invite_status: 'accepted',
  })

  // Seed default scoring configs
  const categories: Category[] = ['heisman', 'cfp', 'cinderella', 'conference_champion']
  const segmentOrder = defaultSettings.draft_segment_order as Category[]

  await supabase.from('scoring_configs').insert(
    categories.map(cat => ({
      league_id: league.id,
      category: cat,
      config_json: DEFAULT_SCORING_CONFIGS[cat],
      locked: false,
    }))
  )

  // Seed draft segments
  await supabase.from('draft_segments').insert(
    categories.map(cat => ({
      league_id: league.id,
      category: cat,
      segment_order: segmentOrder.indexOf(cat),
      pick_count_per_player: defaultSettings.pick_counts[cat],
      status: 'pending',
    }))
  )

  // Create draft state
  await supabase.from('draft_state').insert({
    league_id: league.id,
    status: 'not_started',
    current_overall_pick_number: 1,
  })

  return NextResponse.json(league, { status: 201 })
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('leagues')
    .select('*, league_members(count)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
