import { createServiceClient } from '@/lib/supabase/server'

export async function writeAuditLog({
  league_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
}: {
  league_id: string | null
  actor_user_id: string
  action: string
  entity_type: string
  entity_id: string
  before_json?: Record<string, unknown> | null
  after_json?: Record<string, unknown> | null
}) {
  const supabase = await createServiceClient()
  await supabase.from('audit_logs').insert({
    league_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_json: before_json ?? null,
    after_json: after_json ?? null,
  })
}
