import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { z } from 'zod'

const EDITABLE_STATUSES = ['setup', 'data_imported', 'draft_ready']

const UpdateLeagueSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings_json: z.record(z.string(), z.unknown()).optional(),
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
    .select(`
      *,
      league_members(*, users(id, email, display_name)),
      draft_segments(*),
      scoring_configs(*),
      draft_state(*)
    `)
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
    .select('status')
    .eq('id', leagueId)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  const body = await request.json()

  // Trash talk and moderation flags are always editable
  const trashTalkOnlyEdit = Object.keys(body).every(k =>
    ['trash_talk_enabled', 'trash_talk_moderation'].includes(k)
  )

  if (!EDITABLE_STATUSES.includes(league.status) && !trashTalkOnlyEdit) {
    return NextResponse.json(
      { error: 'League settings are locked once the draft starts' },
      { status: 409 }
    )
  }

  const parsed = UpdateLeagueSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { data, error } = await supabase
    .from('leagues')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', leagueId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
