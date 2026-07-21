import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireLeagueMember, requireAdmin } from '@/lib/auth'
import { z } from 'zod'

const PostSchema = z.object({
  body: z.string().min(1).max(500),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('trash_talk_posts')
    .select('*, users(id, display_name)')
    .eq('league_id', leagueId)
    .eq('deleted', false)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const supabase = await createServiceClient()

  // Check trash talk enabled
  const { data: league } = await supabase
    .from('leagues')
    .select('settings_json')
    .eq('id', leagueId)
    .single()

  if (!league?.settings_json?.trash_talk_enabled) {
    return NextResponse.json({ error: 'Trash talk is disabled for this league' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('trash_talk_posts')
    .insert({ league_id: leagueId, user_id: user.id, body: parsed.data.body })
    .select('*, users(id, display_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const user = await requireLeagueMember(leagueId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('id')
  if (!postId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: post } = await supabase
    .from('trash_talk_posts')
    .select('user_id')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = await requireAdmin()
  if (post.user_id !== user.id && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabase
    .from('trash_talk_posts')
    .update({ deleted: true })
    .eq('id', postId)

  return NextResponse.json({ success: true })
}
