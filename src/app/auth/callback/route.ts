import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Email OTP types Supabase can send to this callback via ?token_hash=&type=
const OTP_TYPES: readonly string[] = [
  'magiclink',
  'signup',
  'invite',
  'recovery',
  'email_change',
  'email',
]

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const redirectTo = searchParams.get('redirectTo') || '/leagues'

  // token_hash flow: no code_verifier cookie required, so it works even when the
  // link is opened in a different browser than the one that requested it (e.g. a
  // mail app's in-app browser). Tried first because it is the reliable path.
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // PKCE flow: kept intact for same-browser logins and any existing links.
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`)
}
