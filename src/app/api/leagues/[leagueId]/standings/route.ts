import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireLeagueMember } from '@/lib/auth'
import { buildStandings, ScoredPickInput, MemberInput } from '@/lib/scoring/standings'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()

  const [{ data: members }, { data: scores }, { data: league }] = await Promise.all([
    supabase
      .from('league_members')
      .select('user_id, display_name, draft_position')
      .eq('league_id', leagueId)
      .eq('role_in_league', 'player'),
    supabase
      .from('scores')
      .select('*, draft_picks(*, draftable_entities(*))')
      .eq('league_id', leagueId)
      .eq('published', true),
    supabase
      .from('leagues')
      .select('settings_json, status')
      .eq('id', leagueId)
      .single(),
  ])

  const allowProvisional = (league?.settings_json as Record<string, unknown>)?.allow_provisional_visibility ?? false
  let allScores = (scores ?? []) as Array<Record<string, unknown>>

  if (allowProvisional && allScores.length === 0) {
    const { data: provisional } = await supabase
      .from('scores')
      .select('*, draft_picks(*, draftable_entities(*))')
      .eq('league_id', leagueId)
    allScores = (provisional ?? []) as Array<Record<string, unknown>>
  }

  const standings = buildStandings(
    (members ?? []) as MemberInput[],
    allScores.map(s => ({
      pick: (s.draft_picks as Record<string, unknown>) ?? {},
      score: s,
    })) as ScoredPickInput[]
  )

  const { data: publishedImports } = await supabase
    .from('result_imports')
    .select('result_type, status')
    .eq('league_id', leagueId)

  const settings = (league?.settings_json ?? {}) as { draft_segment_order?: string[] }
  const cats = settings.draft_segment_order && settings.draft_segment_order.length > 0
    ? settings.draft_segment_order
    : ['heisman', 'cfp', 'cinderella', 'conference_champion']

  const milestones: Record<string, boolean> = {}
  for (const cat of cats) {
    milestones[cat] = (publishedImports ?? []).some(
      (i: Record<string, unknown>) => i.result_type === cat && i.status === 'published'
    )
  }

  return NextResponse.json({ standings, milestones, categories: cats, as_of: new Date().toISOString() })
}
