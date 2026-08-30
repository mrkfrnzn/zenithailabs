import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

  // Build the success response up front so the Supabase client can write the
  // session cookies straight onto it. Writing them through the next/headers
  // cookies() store does not reliably reach a separately-constructed
  // NextResponse.redirect(), which silently produced a valid Supabase session
  // that the browser never received.
  const response = NextResponse.redirect(`${origin}${redirectTo}`)
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // token_hash flow: no code_verifier cookie required, so it works even when the
  // link is opened in a different browser than the one that requested it.
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) {
      return response
    }
  }

  // PKCE flow: same-browser logins, including Supabase's default email template.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`)
}
