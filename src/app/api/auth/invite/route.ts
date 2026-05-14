import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { sendInviteEmail } from '@/lib/email'
import { z } from 'zod'

const InviteSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(50),
  league_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { email, display_name, league_id } = parsed.data
  const supabase = await createServiceClient()

  // Upsert auth user (magic link; shouldCreateUser covers first invite)
  const { data: existingAuth } = await supabase.auth.admin.listUsers()
  let userId: string | null = null

  const existingUser = existingAuth?.users?.find(u => u.email === email)
  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    userId = data.user.id
  }

  // Upsert users profile
  await supabase.from('users').upsert({
    id: userId,
    email,
    display_name,
    role: 'player',
  }, { onConflict: 'id' })

  // Add to league_members if not already
  const { error: memberError } = await supabase.from('league_members').upsert({
    league_id,
    user_id: userId,
    display_name,
    role_in_league: 'player',
    invite_status: 'pending',
  }, { onConflict: 'league_id,user_id' })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  // Send invite email
  await sendInviteEmail({ email, display_name, league_id })

  return NextResponse.json({ success: true })
}
