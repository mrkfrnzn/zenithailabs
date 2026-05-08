"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, Category } from "@/lib/categories";

type Member = { userId: string; displayName: string; draftPosition: number };
type Segment = {
  id: string;
  category: string;
  segmentOrder: number;
  pickCountPerPlayer: number;
  status: string;
};
type Entity = {
  id: string;
  entityType: string;
  athleteName: string | null;
  schoolName: string;
  conference: string | null;
  position: string | null;
  preseasonRank: number | null;
  oddsAmerican: number;
  eligibleCategories: string[];
};
type Pick = {
  id: string;
  overallPickNumber: number;
  roundNumber: number;
  category: string;
  playerUserId: string;
  playerName: string;
  entityId: string;
  entityLabel: string;
  conference: string | null;
  lockedOdds: number;
  adminOverride: boolean;
};
type State = {
  status: string;
  paused: boolean;
  currentSegmentId: string | null;
  currentOverallPickNumber: number;
  currentPlayerUserId: string | null;
  tick: number;
};
type PlanRow = {
  overallPickNumber: number;
  category: string;
  playerUserId: string | null;
};

export function DraftRoom(props: {
  currentUser: { id: string; displayName: string; role: string };
  league: { id: string; name: string; status: string; exclusivity: string };
  members: Member[];
  segments: Segment[];
  state: State | null;
  entities: Entity[];
  picks: Pick[];
  plan: PlanRow[];
}) {
  const { currentUser, league, members, segments, state, entities, picks, plan } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState<string>("");
  const [oddsMax, setOddsMax] = useState<string>("");
  const [oddsMin, setOddsMin] = useState<string>("");

  // Realtime: subscribe to SSE and refresh on events.
  useEffect(() => {
    const es = new EventSource(`/api/leagues/${league.id}/draft/stream`);
    const refresh = () => router.refresh();
    es.addEventListener("draft", refresh);
    es.onerror = () => {
      // Browser auto-reconnects.
    };
    return () => es.close();
  }, [league.id, router]);

  const onTheClock = state?.currentPlayerUserId ?? null;
  const isMyPick = onTheClock === currentUser.id && state?.status === "active" && !state?.paused;
  const isAdmin = currentUser.role === "admin";

  const currentSegment = state?.currentSegmentId
    ? segments.find((s) => s.id === state.currentSegmentId)
    : null;
  const currentCategory = (currentSegment?.category ?? "") as Category | "";

  // Build set of taken entity ids for fast checks
  const takenIds = useMemo(() => new Set(picks.map((p) => p.entityId)), [picks]);
  // Build map of takenInCategory if exclusivity is per-category
  const takenInCategory = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of picks) {
      let s = m.get(p.category);
      if (!s) {
        s = new Set();
        m.set(p.category, s);
      }
      s.add(p.entityId);
    }
    return m;
  }, [picks]);

  const conferences = useMemo(() => {
    const all = new Set<string>();
    for (const e of entities) if (e.conference) all.add(e.conference);
    return Array.from(all).sort();
  }, [entities]);

  const filteredEntities = useMemo(() => {
    const q = search.toLowerCase().trim();
    return entities.filter((e) => {
      if (currentCategory && !e.eligibleCategories.includes(currentCategory)) return false;
      if (confFilter && e.conference !== confFilter) return false;
      if (oddsMin && e.oddsAmerican < Number(oddsMin)) return false;
      if (oddsMax && e.oddsAmerican > Number(oddsMax)) return false;
      if (q) {
        const hay = (e.athleteName ?? "") + " " + e.schoolName + " " + (e.conference ?? "") + " " + (e.position ?? "");
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [entities, search, confFilter, oddsMin, oddsMax, currentCategory]);

  const isUnavailable = (e: Entity) => {
    if (league.exclusivity === "global_across_all_categories") return takenIds.has(e.id);
    return (takenInCategory.get(currentCategory || "") ?? new Set()).has(e.id);
  };

  const submitPick = (entityId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/leagues/${league.id}/draft/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftableEntityId: entityId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Pick failed.");
      } else {
        router.refresh();
      }
    });
  };

  // Build upcoming pick rows
  const upcoming = plan
    .filter((p) => p.overallPickNumber > (state?.currentOverallPickNumber ?? 0))
    .slice(0, 8);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="panel flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs text-slate-400 uppercase">On the clock</div>
            <div className="text-2xl font-extrabold">
              {onTheClock
                ? members.find((m) => m.userId === onTheClock)?.displayName ?? "—"
                : state?.status === "complete"
                ? "Draft complete"
                : "Not started"}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase">Pick</div>
            <div className="text-lg font-bold">#{state?.currentOverallPickNumber ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase">Category</div>
            <div className="text-lg font-bold">
              {currentCategory ? CATEGORY_LABELS[currentCategory] : "—"}
            </div>
          </div>
          {state?.paused ? <span className="badge-amber">Paused</span> : null}
          {isMyPick ? <span className="badge-green">It’s your pick</span> : null}
          {isAdmin ? <span className="badge-blue">Admin view</span> : null}
        </div>

        {error ? (
          <div className="px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        ) : null}

        <div className="panel">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
            <input
              className="input md:col-span-2"
              placeholder="Search athlete, school, conference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input" value={confFilter} onChange={(e) => setConfFilter(e.target.value)}>
              <option value="">All conferences</option>
              {conferences.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="Odds ≥"
                type="number"
                value={oddsMin}
                onChange={(e) => setOddsMin(e.target.value)}
              />
              <input
                className="input"
                placeholder="Odds ≤"
                type="number"
                value={oddsMax}
                onChange={(e) => setOddsMax(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto max-h-[560px]">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>School</th>
                  <th>Athlete</th>
                  <th>Conf</th>
                  <th>Pos</th>
                  <th className="text-right">Pre Rank</th>
                  <th className="text-right">Odds</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntities.map((e) => {
                  const unavailable = isUnavailable(e);
                  return (
                    <tr key={e.id} className={unavailable ? "opacity-40" : ""}>
                      <td className="text-slate-400">{e.entityType}</td>
                      <td className="font-medium">{e.schoolName}</td>
                      <td>{e.athleteName ?? ""}</td>
                      <td>{e.conference ?? ""}</td>
                      <td>{e.position ?? ""}</td>
                      <td className="text-right">{e.preseasonRank ?? ""}</td>
                      <td className="text-right tabular-nums">
                        {e.oddsAmerican > 0 ? `+${e.oddsAmerican}` : e.oddsAmerican}
                      </td>
                      <td className="text-right">
                        {unavailable ? (
                          <span className="badge-slate">Taken</span>
                        ) : isMyPick || isAdmin ? (
                          <button
                            className="btn-primary text-xs px-3 py-1"
                            disabled={pending || !isMyPick}
                            onClick={() => submitPick(e.id)}
                            title={!isMyPick ? "Wait for your pick" : "Submit pick"}
                          >
                            Draft
                          </button>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredEntities.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-slate-400 py-6">
                      No matches.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="panel">
          <div className="text-xs text-slate-400 uppercase mb-1">Upcoming</div>
          <ol className="text-sm space-y-1">
            {upcoming.map((p) => (
              <li key={p.overallPickNumber}>
                <span className="text-slate-500 mr-2">#{p.overallPickNumber}</span>
                <span className="font-semibold">
                  {p.playerUserId ? members.find((m) => m.userId === p.playerUserId)?.displayName ?? "?" : "—"}
                </span>
                <span className="ml-2 badge-slate">{CATEGORY_LABELS[p.category as Category] ?? p.category}</span>
              </li>
            ))}
            {upcoming.length === 0 ? (
              <li className="text-slate-500">No more picks.</li>
            ) : null}
          </ol>
        </div>
        <div className="panel">
          <div className="text-xs text-slate-400 uppercase mb-1">Recent picks</div>
          <ol className="text-sm space-y-1">
            {[...picks]
              .reverse()
              .slice(0, 12)
              .map((p) => (
                <li key={p.id}>
                  <span className="text-slate-500 mr-2">#{p.overallPickNumber}</span>
                  <span className="font-semibold">{p.playerName}</span>
                  <span className="ml-1 text-slate-400">→</span>{" "}
                  <span>{p.entityLabel}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {p.lockedOdds > 0 ? `+${p.lockedOdds}` : p.lockedOdds}
                  </span>
                </li>
              ))}
            {picks.length === 0 ? <li className="text-slate-500">No picks yet.</li> : null}
          </ol>
        </div>
      </div>
    </div>
  );
}
