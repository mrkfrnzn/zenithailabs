'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { categoryLabel } from '@/lib/utils'
import type { Category } from '@/types'

const IMPORT_CATEGORIES: Category[] = [
  'heisman', 'cfp', 'cinderella', 'conference_champion', 'most_improved', 'disaster_draft',
]
type Flag = { row_index: number; field: string; type: string; message: string }

export default function ImportPage() {
  const params = useParams()
  const leagueId = params.leagueId as string
  const [category, setCategory] = useState<Category>('heisman')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; flags: Flag[]; rows: Record<string, unknown>[] } | null>(null)
  const [error, setError] = useState('')

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', category)

    const res = await fetch(`/api/admin/leagues/${leagueId}/import`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Upload failed')
    } else {
      setResult(data)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/admin/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">📥 Import Preseason Data</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-1">Required columns by category</h2>
          <div className="text-xs text-zinc-400 space-y-1">
            <div><strong>Heisman:</strong> athlete_name, school_name, position, odds, source</div>
            <div><strong>CFP Run:</strong> school_name, conference, preseason_rank, national_title_odds, source</div>
            <div><strong>Cinderella:</strong> school_name, conference, source (preseason_ap_rank optional)</div>
            <div><strong>Conference Champion:</strong> school_name, conference, conference_title_odds, source</div>
            <div><strong>Most Improved:</strong> school_name, conference, preseason_win_total, source</div>
            <div><strong>Disaster Draft:</strong> school_name, conference, source <span className="text-zinc-500">(P4 + Notre Dame only)</span></div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Sample files available in <code>/samples</code></p>
        </div>

        <form onSubmit={handleUpload} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Category</label>
            <div className="flex gap-2 flex-wrap">
              {IMPORT_CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${category === c ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">File (CSV or XLSX, max 5 MB)</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 hover:file:bg-zinc-600"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={!file || loading}
            className="w-full bg-amber-500 text-black font-bold py-3 rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? 'Uploading…' : 'Upload & Validate'}
          </button>
        </form>

        {result && (
          <div className="mt-6 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="green">{result.imported} rows imported</Badge>
                {result.flags.length > 0 && (
                  <Badge variant="red">{result.flags.length} flags</Badge>
                )}
              </div>

              {result.flags.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm text-red-400">Validation Flags</h3>
                  {result.flags.map((flag, i) => (
                    <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2 text-red-300">
                      <span className="font-mono">[{flag.type}]</span> {flag.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 font-medium text-sm">Preview ({result.rows.length} rows)</div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      {result.rows.length > 0 && Object.keys(result.rows[0]).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {result.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className={`hover:bg-zinc-800/50 ${result.flags.some(f => f.row_index === i) ? 'bg-red-500/5' : ''}`}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-2 text-zinc-300">{String(val ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
