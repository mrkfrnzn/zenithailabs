import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json(null, { status: 401 })
  return NextResponse.json({ id: user.id, email: user.email, display_name: user.display_name, role: user.role })
}
