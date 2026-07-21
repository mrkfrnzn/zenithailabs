'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Post {
  id: string
  body: string
  created_at: string
  user_id: string
  deleted?: boolean
  users: { id: string; display_name: string }
}

export default function TrashTalkPage() {
  const params = useParams()
  const leagueId = params.leagueId as string
  const [posts, setPosts] = useState<Post[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
    })

    // Load initial posts
    fetch(`/api/leagues/${leagueId}/trash-talk`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPosts(data) })

    // Check if admin
    fetch('/api/auth/me').then(r => r.json()).then(d => setIsAdmin(d?.role === 'admin')).catch(() => {})

    // Realtime subscription
    const channel = supabase
      .channel(`trash:${leagueId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trash_talk_posts',
        filter: `league_id=eq.${leagueId}`,
      }, payload => {
        const newPost = payload.new as Post
        if (!newPost.deleted) {
          // Fetch with user info
          fetch(`/api/leagues/${leagueId}/trash-talk`)
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setPosts(data) })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [posts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    const res = await fetch(`/api/leagues/${leagueId}/trash-talk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim() }),
    })
    if (res.ok) {
      setBody('')
      const data = await res.json()
      setPosts(prev => [...prev, data])
    }
    setSending(false)
  }

  const handleDelete = async (postId: string) => {
    await fetch(`/api/leagues/${leagueId}/trash-talk?id=${postId}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/leagues/${leagueId}`} className="text-zinc-400 hover:text-zinc-200 text-sm">← League</Link>
          <h1 className="font-bold">💬 Trash Talk</h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 flex flex-col">
        <div className="flex-1 space-y-3 mb-4">
          {posts.length === 0 ? (
            <p className="text-center text-zinc-500 py-8">No posts yet. Be the first to talk trash! 🏈</p>
          ) : (
            posts.map(post => (
              <div key={post.id} className={`bg-zinc-900 border rounded-xl px-4 py-3 ${post.user_id === currentUserId ? 'border-amber-500/30' : 'border-zinc-800'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    {post.users?.display_name}
                    {post.user_id === currentUserId && <span className="ml-1 text-xs text-amber-400">(you)</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {new Date(post.created_at).toLocaleString()}
                    </span>
                    {(post.user_id === currentUserId || isAdmin) && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-xs text-zinc-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-zinc-200 text-sm whitespace-pre-wrap">{post.body}</p>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 sticky bottom-4">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 500))}
            placeholder="Say something… (max 500 chars)"
            className="flex-1 bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            className="bg-amber-500 text-black font-bold px-4 py-3 rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  )
}
