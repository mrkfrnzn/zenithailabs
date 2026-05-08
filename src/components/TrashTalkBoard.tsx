"use client";

import { useEffect, useState, useTransition } from "react";

type Post = {
  id: string;
  body: string;
  userId: string;
  author: string;
  createdAt: string;
};

export function TrashTalkBoard(props: {
  leagueId: string;
  currentUser: { id: string; displayName: string; role: string };
  enabled: boolean;
  allowSelfDelete: boolean;
  initialPosts: Post[];
}) {
  const { leagueId, currentUser, enabled, allowSelfDelete, initialPosts } = props;
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const es = new EventSource(`/api/leagues/${leagueId}/draft/stream`);
    const refresh = async () => {
      const res = await fetch(`/api/leagues/${leagueId}/trash-talk`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    };
    es.addEventListener("trash", refresh);
    return () => es.close();
  }, [leagueId]);

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/leagues/${leagueId}/trash-talk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Failed to post.");
      } else {
        setBody("");
        const data = await res.json();
        if (data.posts) setPosts(data.posts);
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/leagues/${leagueId}/trash-talk/${id}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    });
  };

  if (!enabled) {
    return <div className="panel text-slate-400">Trash talk is disabled by the commissioner.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-2">
        <textarea
          className="input min-h-[80px]"
          placeholder="Drop a take..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
        />
        {error ? (
          <div className="px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{error}</div>
        ) : null}
        <div className="flex justify-between items-center">
          <div className="text-xs text-slate-500">{body.length}/2000</div>
          <button className="btn-primary" disabled={pending || body.trim().length === 0} onClick={submit}>
            Post
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {posts.length === 0 ? (
          <div className="panel text-slate-400 text-sm">No posts yet.</div>
        ) : null}
        {posts.map((p) => {
          const canDelete =
            currentUser.role === "admin" || (allowSelfDelete && p.userId === currentUser.id);
          return (
            <div key={p.id} className="panel-tight">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-bold text-slate-200">{p.author}</span>
                <span>{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm">{p.body}</div>
              {canDelete ? (
                <div className="mt-2 text-right">
                  <button className="text-red-400 text-xs hover:underline" disabled={pending} onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
