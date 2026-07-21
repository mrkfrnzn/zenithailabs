import { createClient } from '@/lib/supabase/server'
import { User } from '@/types'

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return null
  return user
}

export async function requireAuth(): Promise<User | null> {
  return getSessionUser()
}

export async function requireLeagueMember(leagueId: string): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .single()

  if (!member) return null

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}
