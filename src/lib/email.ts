import { Resend } from 'resend'

// Lazily construct the Resend client so importing this module never throws at
// build time (page-data collection) when RESEND_API_KEY is absent. The key is
// only required when an email is actually sent at runtime.
let _resend: Resend | null = null
function resendClient(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}
const resend = {
  emails: {
    send: (payload: Parameters<Resend['emails']['send']>[0]) => resendClient().emails.send(payload),
  },
}
const FROM = process.env.EMAIL_FROM || 'CFB War Chest <noreply@cfbwarchest.com>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ── Invite ──────────────────────────────────────────────────
export async function sendInviteEmail({
  email,
  display_name,
  league_id,
}: {
  email: string
  display_name: string
  league_id: string
}) {
  const magicLinkUrl = `${APP_URL}/login?redirectTo=/leagues/${league_id}/draft`
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'You\'ve been invited to CFB War Chest 2026 🏈',
    html: `
      <div style="font-family:sans-serif;max-width:480px">
        <h2>Hey ${display_name}!</h2>
        <p>You've been invited to join <strong>CFB War Chest 2026</strong> — a College Football Futures draft league.</p>
        <p><a href="${magicLinkUrl}" style="display:inline-block;background:#f59e0b;color:#000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">Accept Invite & Sign In</a></p>
        <p style="color:#888;font-size:12px">This link will send you a magic login link. It works best on desktop for draft day.</p>
      </div>
    `,
  })
}

// ── On-clock ─────────────────────────────────────────────────
export async function sendOnClockEmail({
  email,
  display_name,
  league_id,
  pick_number,
}: {
  email: string
  display_name: string
  league_id: string
  pick_number: number
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `⏰ You're on the clock — Pick #${pick_number}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px">
        <h2>${display_name}, you're on the clock!</h2>
        <p>It's your turn to make Pick #${pick_number} in CFB War Chest 2026.</p>
        <p><a href="${APP_URL}/leagues/${league_id}/draft" style="display:inline-block;background:#f59e0b;color:#000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">Make Your Pick →</a></p>
      </div>
    `,
  })
}

// ── 30-second warning ─────────────────────────────────────────
export async function sendTimerWarningEmail({
  email,
  display_name,
  league_id,
}: {
  email: string
  display_name: string
  league_id: string
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: '⚠️ 30 seconds left on your pick!',
    html: `
      <div style="font-family:sans-serif;max-width:480px">
        <h2>⚠️ 30 seconds, ${display_name}!</h2>
        <p>Your pick timer is almost up in CFB War Chest 2026.</p>
        <p><a href="${APP_URL}/leagues/${league_id}/draft" style="display:inline-block;background:#ef4444;color:#fff;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">Make Your Pick NOW →</a></p>
      </div>
    `,
  })
}

// ── Standings published ────────────────────────────────────────
export async function sendStandingsEmail({
  emails,
  league_id,
  league_name,
  milestone,
  leaderboard,
}: {
  emails: string[]
  league_id: string
  league_name: string
  milestone: string
  leaderboard: Array<{ rank: number; display_name: string; total_points: number }>
}) {
  const rows = leaderboard
    .slice(0, 5)
    .map(r => `<tr><td>${r.rank}</td><td>${r.display_name}</td><td>${r.total_points.toFixed(1)} pts</td></tr>`)
    .join('')

  await Promise.all(
    emails.map(email =>
      resend.emails.send({
        from: FROM,
        to: email,
        subject: `📊 ${league_name} — ${milestone} standings updated`,
        html: `
          <div style="font-family:sans-serif;max-width:480px">
            <h2>${milestone} results are in!</h2>
            <h3>${league_name} Leaderboard</h3>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr><th>#</th><th>Player</th><th>Points</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p><a href="${APP_URL}/leagues/${league_id}/standings" style="display:inline-block;background:#f59e0b;color:#000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">View Full Standings →</a></p>
          </div>
        `,
      })
    )
  )
}
