import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { z } from 'zod'
import { Category } from '@/types'

// Settings/scoring may only be tweaked before the draft locks.
const EDITABLE_STATUSES = ['setup', 'data_imported', 'draft_ready']

const ScoringConfigSchema = z.object({
  formula: z.enum(['multiplier_odds_ratio', 'fixed_points', 'wins_over_baseline', 'inverted_record']),
  outcomes: z
    .record(z.string(), z.object({ multiplier: z.number().optional(), points: z.number().optional() }))
    .optional(),
  points_per_win: z.number().optional(),
  points_per_loss: z.number().optional(),
  winless_bonus: z.number().optional(),
  floor: z.number().optional(),
  cap: z.number().nullable().optional(),
})

const UpdateScoringSchema = z.object({
  configs: z
    .array(z.object({ category: z.string(), config_json: ScoringConfigSchema }))
    .optional(),
  pick_counts: z.record(z.string(), z.number().int().min(0).max(30)).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('leagues')
    .select('id, name, status, season_year, settings_json, scoring_configs(*), draft_segments(*)')
    .eq('id', leagueId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const supabase = await createServiceClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('status, settings_json')
    .eq('id', leagueId)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (!EDITABLE_STATUSES.includes(league.status)) {
    return NextResponse.json(
      { error: 'Scoring is locked once the draft starts' },
      { status: 409 }
    )
  }

  const body = await request.json()
  const parsed = UpdateScoringSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { configs, pick_counts } = parsed.data

  // ── Update scoring configs ──────────────────────────────────────────────────
  if (configs && configs.length > 0) {
    for (const { category, config_json } of configs) {
      const { data: existing } = await supabase
        .from('scoring_configs')
        .select('config_json, locked')
        .eq('league_id', leagueId)
        .eq('category', category)
        .single()

      if (existing?.locked) continue // never overwrite a locked config

      const { error: updateErr } = await supabase
        .from('scoring_configs')
        .update({ config_json, updated_at: new Date().toISOString() })
        .eq('league_id', leagueId)
        .eq('category', category)

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      await writeAuditLog({
        league_id: leagueId,
        actor_user_id: admin.id,
        action: 'update_scoring_config',
        entity_type: 'scoring_config',
        entity_id: category,
        before_json: existing?.config_json ?? null,
        after_json: config_json,
      })
    }
  }

  // ── Update pick counts (settings_json + draft_segments) ─────────────────────
  if (pick_counts && Object.keys(pick_counts).length > 0) {
    const currentSettings = (league.settings_json ?? {}) as Record<string, unknown>
    const currentCounts = (currentSettings.pick_counts ?? {}) as Record<string, number>
    const nextCounts = { ...currentCounts, ...pick_counts }

    const { error: settingsErr } = await supabase
      .from('leagues')
      .update({
        settings_json: { ...currentSettings, pick_counts: nextCounts },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (settingsErr) return NextResponse.json({ error: settingsErr.message }, { status: 500 })

    for (const [category, count] of Object.entries(pick_counts)) {
      await supabase
        .from('draft_segments')
        .update({ pick_count_per_player: count })
        .eq('league_id', leagueId)
        .eq('category', category as Category)
    }

    await writeAuditLog({
      league_id: leagueId,
      actor_user_id: admin.id,
      action: 'update_pick_counts',
      entity_type: 'league',
      entity_id: leagueId,
      before_json: currentCounts,
      after_json: nextCounts,
    })
  }

  const { data: updated } = await supabase
    .from('leagues')
    .select('id, name, status, season_year, settings_json, scoring_configs(*), draft_segments(*)')
    .eq('id', leagueId)
    .single()

  return NextResponse.json({ success: true, league: updated })
}
