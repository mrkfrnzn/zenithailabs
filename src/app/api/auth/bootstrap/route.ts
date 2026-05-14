import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/auth/bootstrap
// Creates the initial admin account from env vars.
// Only works if no admin exists yet.
export async function POST() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'Commissioner'

  if (!adminEmail) {
    return NextResponse.json({ error: 'BOOTSTRAP_ADMIN_EMAIL not set' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Check if admin already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Admin already exists' }, { status: 409 })
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 500 })
  }

  // Create profile
  const { error: profileError } = await supabase.from('users').insert({
    id: authData.user.id,
    email: adminEmail,
    display_name: adminName,
    role: 'admin',
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: adminEmail })
}
