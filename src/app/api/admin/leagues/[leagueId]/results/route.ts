import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { parseCSV, parseXLSX, normalizeName } from '@/lib/import/parser'
import { findMatches } from '@/lib/import/fuzzy'
import { calculateScore, cinderellaRankToOutcome } from '@/lib/scoring/engine'
import { writeAuditLog } from '@/lib/audit'
import { sendStandingsEmail } from '@/lib/email'
import { buildStandings } from '@/lib/scoring/standings'
import { z } from 'zod'
import { Category, ScoringConfigData } from '@/types'

const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const supabase = await createServiceClient()

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const category = formData.get('category') as Category | null
  const action = formData.get('action') as string | null // 'upload' | 'confirm_match' | 'publish'

  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })

  // ── PUBLISH ───────────────────────────────────────────────────────────────
  if (action === 'publish') {
    const importId = formData.get('import_id') as string

    // Get all result rows for this import
    const { data: resultRows } = await supabase
      .from('result_rows')
      .select('*')
      .eq('result_import_id', importId)
      .neq('match_status', 'unmatched')

    if (!resultRows) return NextResponse.json({ error: 'No result rows found' }, { status: 404 })

    // Get all picks + locked scoring config
    const { data: picks } = await supabase
      .from('draft_picks')
      .select('*, draftable_entities(*)')
      .eq('league_id', leagueId)
      .eq('category', category)

    const { data: scoringConfig } = await supabase
      .from('scoring_configs')
      .select('config_json')
      .eq('league_id', leagueId)
      .eq('category', category)
      .single()

    if (!picks || !scoringConfig) return NextResponse.json({ error: 'Missing picks or config' }, { status: 500 })

    // Build result map: entity_id → { outcome, raw row }. The raw row carries the
    // regular-season record needed by the record-based categories.
    const resultByEntity: Record<string, { outcome: string | null; raw: Record<string, unknown> }> = {}
    for (const row of resultRows as Array<{
      matched_entity_id: string | null
      outcome: string | null
      raw_row_json: Record<string, unknown> | null
    }>) {
      if (row.matched_entity_id) {
        resultByEntity[row.matched_entity_id] = {
          outcome: row.outcome ?? null,
          raw: row.raw_row_json ?? {},
        }
      }
    }
    const num = (v: unknown): number | null => {
      if (v == null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }

    // Build context for scoring: all picks' odds
    const allOdds = picks
      .map((p: { draftable_entities: { odds: number | null; conference: string | null } }) => p.draftable_entities?.odds)
      .filter(Boolean) as number[]

    const oddsByConference: Record<string, number[]> = {}
    for (const p of picks as Array<{
      draftable_entities: { odds: number | null; conference: string | null }
    }>) {
      const conf = p.draftable_entities?.conference
      const odds = p.draftable_entities?.odds
      if (conf && odds) {
        oddsByConference[conf] = [...(oddsByConference[conf] ?? []), odds]
      }
    }

    const config = scoringConfig.config_json as ScoringConfigData

    // Calculate and upsert scores
    const scoreRows = picks.map((pick: {
      id: string
      draftable_entities: { id: string; odds: number | null; conference: string | null; preseason_win_total: number | null }
      category: Category
      locked_odds: number | null
    }) => {
      const entity = pick.draftable_entities
      const res = resultByEntity[entity.id]
      const outcome = res?.outcome ?? null
      const raw = res?.raw ?? {}

      // Resolve the outcome / record inputs per category.
      let resolvedOutcome = outcome
      let regularSeasonWins: number | null = null
      let regularSeasonLosses: number | null = null
      let preseasonWinTotal: number | null = null

      if (category === 'cinderella' && outcome && /^\d+$/.test(outcome)) {
        // Cinderella: convert final AP rank to a bucket.
        resolvedOutcome = cinderellaRankToOutcome(parseInt(outcome))
      } else if (category === 'most_improved') {
        regularSeasonWins = num(raw.actual_wins ?? raw.wins ?? raw.regular_season_wins)
        preseasonWinTotal = entity.preseason_win_total ?? null
        resolvedOutcome = regularSeasonWins != null && preseasonWinTotal != null
          ? `${regularSeasonWins} wins (line ${preseasonWinTotal})`
          : null
      } else if (category === 'disaster_draft') {
        regularSeasonWins = num(raw.wins ?? raw.regular_season_wins ?? raw.actual_wins)
        regularSeasonLosses = num(raw.losses ?? raw.regular_season_losses)
        resolvedOutcome = regularSeasonWins != null || regularSeasonLosses != null
          ? `${regularSeasonWins ?? '?'}-${regularSeasonLosses ?? '?'}`
          : null
      }

      const calculation = calculateScore(
        {
          draft_pick_id: pick.id,
          category,
          locked_odds: pick.locked_odds,
          outcome: resolvedOutcome,
          conference: entity.conference,
          regular_season_wins: regularSeasonWins,
          regular_season_losses: regularSeasonLosses,
          preseason_win_total: preseasonWinTotal,
        },
        config,
        {
          allPicksOddsByCategory: { [category]: allOdds },
          allPicksOddsByConference: oddsByConference,
        }
      )

      return {
        league_id: leagueId,
        draft_pick_id: pick.id,
        category,
        outcome: resolvedOutcome,
        points: calculation.points,
        calculation_json: calculation,
        published: true,
      }
    })

    // Upsert scores
    const { error: scoreError } = await supabase
      .from('scores')
      .upsert(scoreRows, { onConflict: 'draft_pick_id' })

    if (scoreError) return NextResponse.json({ error: scoreError.message }, { status: 500 })

    // Update import status
    await supabase.from('result_imports').update({ status: 'published' }).eq('id', importId)

    await writeAuditLog({
      league_id: leagueId,
      actor_user_id: admin.id,
      action: 'publish_standings',
      entity_type: 'result_import',
      entity_id: importId,
      after_json: { category, scores: scoreRows.length },
    })

    // Send email to all members
    const { data: members } = await supabase
      .from('league_members')
      .select('users(email, display_name)')
      .eq('league_id', leagueId)

    const { data: league } = await supabase.from('leagues').select('name').eq('id', leagueId).single()
    const { data: allScores } = await supabase
      .from('scores')
      .select('*, draft_picks(*, draftable_entities(*))')
      .eq('league_id', leagueId)
      .eq('published', true)

    const { data: allMembers } = await supabase
      .from('league_members')
      .select('user_id, display_name')
      .eq('league_id', leagueId)

    if (members && league && allScores && allMembers) {
      const standings = buildStandings(
        allMembers as Array<{ user_id: string; display_name: string }>,
        (allScores as Array<Record<string, unknown>>).map(s => ({
          pick: (s.draft_picks as Record<string, unknown>) ?? {},
          score: s,
        })) as Parameters<typeof buildStandings>[1]
      )

      const emails = (members as Array<{ users: { email: string } | { email: string }[] }>).map(m => {
        const u = m.users
        return Array.isArray(u) ? u[0]?.email : u?.email
      }).filter(Boolean) as string[]
      sendStandingsEmail({
        emails,
        league_id: leagueId,
        league_name: league.name,
        milestone: category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
        leaderboard: standings.map(s => ({ rank: s.rank, display_name: s.display_name, total_points: s.total_points })),
      }).catch(console.error)
    }

    return NextResponse.json({ success: true, scores: scoreRows.length })
  }

  // ── UPLOAD ────────────────────────────────────────────────────────────────
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = file.name.toLowerCase()

  let rawRows
  try {
    rawRows = fileName.endsWith('.csv') ? parseCSV(buffer) : parseXLSX(buffer)
  } catch (e) {
    return NextResponse.json({ error: `Parse error: ${e}` }, { status: 400 })
  }

  // Get drafted entities for matching
  const { data: draftedEntities } = await supabase
    .from('draftable_entities')
    .select('id, normalized_name, athlete_name, school_name, conference, eligible_categories_json')
    .eq('league_id', leagueId)
    .contains('eligible_categories_json', [category])

  const candidates = (draftedEntities ?? []).map((e: {
    id: string
    normalized_name: string
    athlete_name: string | null
    school_name: string | null
  }) => ({
    id: e.id,
    name: e.athlete_name ?? e.school_name ?? '',
    normalized: e.normalized_name,
  }))

  // Create result_import record
  const { data: resultImport, error: importError } = await supabase
    .from('result_imports')
    .insert({
      league_id: leagueId,
      result_type: category,
      file_name: file.name,
      status: 'reviewing',
      raw_rows_json: rawRows,
      created_by: admin.id,
    })
    .select()
    .single()

  if (importError) return NextResponse.json({ error: importError.message }, { status: 500 })

  // Match rows
  const matchedRows = rawRows.map(row => {
    const nameField = row.athlete_name ?? row.school_name ?? row.name ?? ''
    const queryName = String(nameField ?? '')
    const { exact, fuzzy } = findMatches(normalizeName(queryName), candidates)

    return {
      result_import_id: resultImport.id,
      league_id: leagueId,
      matched_entity_id: exact?.id ?? null,
      raw_row_json: row,
      normalized_values_json: { name: normalizeName(queryName) },
      outcome: String(row.outcome ?? row.result ?? ''),
      match_status: exact ? 'auto' : fuzzy.length > 0 ? 'fuzzy' : 'unmatched',
      admin_notes: fuzzy.length > 0 ? JSON.stringify(fuzzy.slice(0, 3).map(f => f.candidate.id)) : null,
    }
  })

  await supabase.from('result_rows').insert(matchedRows)

  const autoCount = matchedRows.filter(r => r.match_status === 'auto').length
  const fuzzyCount = matchedRows.filter(r => r.match_status === 'fuzzy').length
  const unmatchedCount = matchedRows.filter(r => r.match_status === 'unmatched').length

  return NextResponse.json({
    import_id: resultImport.id,
    total: rawRows.length,
    auto_matched: autoCount,
    fuzzy_matched: fuzzyCount,
    unmatched: unmatchedCount,
    rows: matchedRows,
  })
}
