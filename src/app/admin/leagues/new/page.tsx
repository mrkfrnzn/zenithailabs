'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const DEFAULT_CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC']

export default function CreateLeaguePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [year, setYear] = useState(2026)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [conferences, setConferences] = useState<string[]>(DEFAULT_CONFERENCES)
  const [newConf, setNewConf] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addConf = () => {
    if (newConf.trim() && !conferences.includes(newConf.trim())) {
      setConferences([...conferences, newConf.trim()])
      setNewConf('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, season_year: year, max_players: maxPlayers, conferences }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error?.formErrors?.[0] ?? data.error ?? 'Failed to create league')
      setLoading(false)
      return
    }

    const league = await res.json()
    router.push(`/admin/leagues/${league.id}`)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin" className="text-zinc-400 hover:text-zinc-200 text-sm">← Admin</Link>
          <h1 className="font-bold">Create League</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">League Name</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. War Chest 2026"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Season Year</label>
                <input
                  type="number"
                  value={year}
                  onChange={e => setYear(parseInt(e.target.value))}
                  min={2024}
                  max={2030}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Max Players (3–8)</label>
                <input
                  type="number"
                  value={maxPlayers}
                  onChange={e => setMaxPlayers(parseInt(e.target.value))}
                  min={3}
                  max={8}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Conferences</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {conferences.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-200 text-sm px-3 py-1 rounded-full">
                    {c}
                    <button type="button" onClick={() => setConferences(conferences.filter(x => x !== c))} className="text-zinc-500 hover:text-red-400 ml-1">✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newConf}
                  onChange={e => setNewConf(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addConf())}
                  placeholder="Add conference…"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button type="button" onClick={addConf} className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg text-sm">Add</button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim() || conferences.length === 0}
            className="w-full bg-amber-500 text-black font-bold py-3 rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create League'}
          </button>
        </form>
      </main>
    </div>
  )
}
