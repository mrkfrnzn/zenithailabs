'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { categoryLabel, categoryColor } from '@/lib/utils'
import type { Category, ScoringConfigData } from '@/types'

interface EditorConfig {
  category: Category
  config_json: ScoringConfigData
  locked: boolean
}

interface Props {
  leagueId: string
  editable: boolean
  categories: Category[]
  configs: EditorConfig[]
  pickCounts: Record<string, number>
}

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function ScoringEditor({ leagueId, editable, categories, configs, pickCounts }: Props) {
  const router = useRouter()
  const configByCat = new Map(configs.map(c => [c.category, c]))

  const [working, setWorking] = useState<Record<string, ScoringConfigData>>(
    () => Object.fromEntries(configs.map(c => [c.category, structuredClone(c.config_json)]))
  )
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...pickCounts }))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const patchConfig = (cat: string, updater: (c: ScoringConfigData) => ScoringConfigData) => {
    setWorking(prev => ({ ...prev, [cat]: updater(prev[cat]) }))
  }

  const setOutcome = (cat: string, key: string, field: 'multiplier' | 'points', value: number) => {
    patchConfig(cat, c => ({
      ...c,
      outcomes: { ...(c.outcomes ?? {}), [key]: { ...(c.outcomes?.[key] ?? {}), [field]: value } },
    }))
  }

  const setParam = (cat: string, field: keyof ScoringConfigData, value: number | null) => {
    patchConfig(cat, c => ({ ...c, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    const payload = {
      configs: categories
        .filter(cat => !configByCat.get(cat)?.locked && working[cat])
        .map(cat => ({ category: cat, config_json: working[cat] })),
      pick_counts: counts,
    }
    const res = await fetch(`/api/admin/leagues/${leagueId}/scoring`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg({ text: typeof data.error === 'string' ? data.error : 'Save failed', ok: false })
    } else {
      setMsg({ text: 'Scoring configuration saved', ok: true })
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {!editable && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-4 py-3 text-sm">
          This league&apos;s draft has started — scoring is locked and shown read-only.
        </div>
      )}

      {categories.map(cat => {
        const cfg = working[cat]
        const locked = configByCat.get(cat)?.locked ?? false
        const disabled = !editable || locked
        if (!cfg) return null

        return (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 flex-wrap">
              <Badge variant={categoryColor(cat)}>{categoryLabel(cat)}</Badge>
              <span className="text-xs text-zinc-500 font-mono">{cfg.formula}</span>
              {locked && <Badge variant="default" className="text-[10px]">locked</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs text-zinc-400">Picks / player</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={counts[cat] ?? 0}
                  disabled={disabled}
                  onChange={e => setCounts(prev => ({ ...prev, [cat]: Number(e.target.value) }))}
                  className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-right disabled:opacity-50"
                />
              </div>
            </div>

            <div className="p-4 grid gap-3 sm:grid-cols-2">
              {/* Outcome-bucket formulas */}
              {(cfg.formula === 'multiplier_odds_ratio' || cfg.formula === 'fixed_points') &&
                Object.entries(cfg.outcomes ?? {}).map(([key, val]) => {
                  const field = cfg.formula === 'fixed_points' ? 'points' : 'multiplier'
                  return (
                    <NumberField
                      key={key}
                      label={humanize(key)}
                      suffix={field === 'multiplier' ? '×' : 'pts'}
                      value={val[field] ?? 0}
                      disabled={disabled}
                      onChange={v => setOutcome(cat, key, field, v)}
                    />
                  )
                })}

              {/* Most Improved */}
              {cfg.formula === 'wins_over_baseline' && (
                <>
                  <NumberField label="Points per win above baseline" value={cfg.points_per_win ?? 25} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'points_per_win', v)} />
                  <NumberField label="Floor (minimum score)" value={cfg.floor ?? 0} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'floor', v)} />
                  <NullableNumberField label="Cap (blank = uncapped)" value={cfg.cap ?? null} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'cap', v)} />
                </>
              )}

              {/* Disaster Draft */}
              {cfg.formula === 'inverted_record' && (
                <>
                  <NumberField label="Points per loss" value={cfg.points_per_loss ?? 20} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'points_per_loss', v)} />
                  <NumberField label="Points per win (negative)" value={cfg.points_per_win ?? -20} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'points_per_win', v)} />
                  <NumberField label="Winless bonus (shoot the moon)" value={cfg.winless_bonus ?? 200} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'winless_bonus', v)} />
                  <NumberField label="Floor (minimum score)" value={cfg.floor ?? 0} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'floor', v)} />
                  <NullableNumberField label="Cap (blank = uncapped)" value={cfg.cap ?? null} suffix="pts" disabled={disabled} onChange={v => setParam(cat, 'cap', v)} />
                </>
              )}
            </div>
          </div>
        )
      })}

      {editable && (
        <div className="flex items-center gap-4 sticky bottom-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 text-black font-bold px-6 py-3 rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Scoring Configuration'}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</span>
          )}
        </div>
      )}
    </div>
  )
}

function NumberField({
  label, value, suffix, disabled, onChange,
}: { label: string; value: number; suffix?: string; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm disabled:opacity-50"
        />
        {suffix && <span className="text-xs text-zinc-500 w-8">{suffix}</span>}
      </div>
    </label>
  )
}

function NullableNumberField({
  label, value, suffix, disabled, onChange,
}: { label: string; value: number | null; suffix?: string; disabled?: boolean; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value ?? ''}
          placeholder="∞"
          disabled={disabled}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm disabled:opacity-50"
        />
        {suffix && <span className="text-xs text-zinc-500 w-8">{suffix}</span>}
      </div>
    </label>
  )
}
