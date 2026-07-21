import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { parseCSV, parseXLSX, normalizeRow, normalizeName, validateRows } from '@/lib/import/parser'
import { Category } from '@/types'
import { z } from 'zod'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const supabase = await createServiceClient()

  // Check league status allows import
  const { data: league } = await supabase
    .from('leagues')
    .select('status')
    .eq('id', leagueId)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (['drafting', 'drafted', 'scoring', 'completed'].includes(league.status)) {
    return NextResponse.json({ error: 'Cannot import after draft lock' }, { status: 409 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const category = formData.get('category') as Category | null

  if (!file || !category) {
    return NextResponse.json({ error: 'file and category are required' }, { status: 400 })
  }

  const validCategories: Category[] = [
    'heisman', 'cfp', 'cinderella', 'conference_champion', 'most_improved', 'disaster_draft',
  ]
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = file.name.toLowerCase()

  let rawRows
  try {
    if (fileName.endsWith('.csv')) {
      rawRows = parseCSV(buffer)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      rawRows = parseXLSX(buffer)
    } else {
      return NextResponse.json({ error: 'Unsupported file type (CSV or XLSX only)' }, { status: 415 })
    }
  } catch (e) {
    return NextResponse.json({ error: `Parse error: ${e}` }, { status: 400 })
  }

  const normalizedRows = rawRows.map(normalizeRow)
  const flags = validateRows(normalizedRows, category)

  // Upsert entities into draftable_entities
  const entities = normalizedRows.map((row, i) => {
    const nameStr = category === 'heisman'
      ? `${row.athlete_name ?? ''} ${row.school_name ?? ''}`
      : String(row.school_name ?? '')

    const eligibleCategories: Category[] = []
    if (row.eligible_categories && typeof row.eligible_categories === 'string') {
      const cats = row.eligible_categories.split(',').map(s => s.trim())
      for (const cat of cats) {
        if (validCategories.includes(cat as Category)) eligibleCategories.push(cat as Category)
      }
    }
    if (!eligibleCategories.includes(category)) eligibleCategories.push(category)

    const odds = category === 'heisman' ? row.odds :
      category === 'cfp' ? row.national_title_odds :
      category === 'conference_champion' ? row.conference_title_odds : null

    // Most Improved carries a locked preseason win total (its scoring baseline).
    const preseasonWinTotal = category === 'most_improved' && typeof row.preseason_win_total === 'number'
      ? row.preseason_win_total
      : null

    return {
      league_id: leagueId,
      entity_type: category === 'heisman' ? 'athlete' : 'school',
      athlete_name: category === 'heisman' ? String(row.athlete_name ?? '') : null,
      school_name: row.school_name ? String(row.school_name) : null,
      conference: row.conference ? String(row.conference) : null,
      position: row.position ? String(row.position) : null,
      preseason_rank: typeof row.preseason_rank === 'number' ? row.preseason_rank :
        typeof row.preseason_ap_rank === 'number' ? row.preseason_ap_rank : null,
      preseason_win_total: preseasonWinTotal,
      odds: typeof odds === 'number' ? odds : null,
      odds_source: row.source ? String(row.source) : null,
      eligible_categories_json: eligibleCategories,
      raw_import_json: rawRows[i],
      normalized_name: normalizeName(nameStr),
      locked: false,
    }
  })

  // Delete existing imports for this category (re-import flow)
  await supabase
    .from('draftable_entities')
    .delete()
    .eq('league_id', leagueId)
    .contains('eligible_categories_json', [category])

  if (entities.length > 0) {
    const { error: insertError } = await supabase
      .from('draftable_entities')
      .insert(entities)

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Transition league status
  if (league.status === 'setup') {
    await supabase
      .from('leagues')
      .update({ status: 'data_imported' })
      .eq('id', leagueId)
  }

  return NextResponse.json({
    imported: entities.length,
    flags,
    rows: normalizedRows,
  })
}
