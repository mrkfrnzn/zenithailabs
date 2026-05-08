import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import {
  startDraftAction,
  pauseDraftAction,
  resumeDraftAction,
  undoLastPickAction,
  resetDraftAction,
  adminOverrideAction,
} from "./actions";
import { CATEGORY_LABELS, Category } from "@/lib/categories";

export default async function DraftControl({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ err?: string; msg?: string }>;
}) {
  await requireAdmin();
  const { leagueId } = await params;
  const sp = await searchParams;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      draftState: true,
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
      draftPicks: {
        include: { player: true, draftableEntity: true },
        orderBy: { overallPickNumber: "desc" },
        take: 10,
      },
    },
  });
  if (!league) notFound();
  const state = league.draftState;
  const currentPlayer = state?.currentPlayerUserId
    ? league.members.find((m) => m.userId === state.currentPlayerUserId)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/leagues/${leagueId}`} className="text-amber-400 text-sm hover:underline">← Back to league</Link>
        <h1 className="text-2xl font-bold mt-1">Draft control</h1>
        <p className="text-slate-400 text-sm">Start, pause, resume, override picks, and audit actions.</p>
      </div>

      {sp.msg ? <div className="px-3 py-2 rounded bg-green-500/15 border border-green-500/30 text-green-300 text-sm">{sp.msg}</div> : null}
      {sp.err ? <div className="px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{sp.err}</div> : null}

      <div className="panel grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase text-slate-400">League status</div>
          <div className="mt-1"><StatusBadge status={league.status} /></div>
          <div className="mt-3 text-sm">
            <div>State: <span className="font-semibold">{state?.status ?? "n/a"}</span> {state?.paused ? <span className="badge-amber ml-2">Paused</span> : null}</div>
            <div>Current overall pick: <span className="font-semibold">{state?.currentOverallPickNumber ?? "-"}</span></div>
            <div>On the clock: <span className="font-semibold">{currentPlayer?.displayName ?? "-"}</span></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {state?.status === "not_started" || state?.status === "complete" ? (
              <form action={startDraftAction.bind(null, leagueId)}>
                <button className="btn-primary">Start draft</button>
              </form>
            ) : null}
            {state?.status === "active" && !state.paused ? (
              <form action={pauseDraftAction.bind(null, leagueId)}>
                <button className="btn-secondary">Pause</button>
              </form>
            ) : null}
            {state?.status === "active" && state.paused ? (
              <form action={resumeDraftAction.bind(null, leagueId)}>
                <button className="btn-primary">Resume</button>
              </form>
            ) : null}
            {state?.status !== "not_started" ? (
              <form action={undoLastPickAction.bind(null, leagueId)}>
                <button className="btn-ghost">Undo last pick</button>
              </form>
            ) : null}
            {state?.currentOverallPickNumber === 0 ||
            (await prisma.draftPick.count({ where: { leagueId } })) === 0 ? (
              <form action={resetDraftAction.bind(null, leagueId)}>
                <button className="btn-ghost">Reset draft (pre-pick only)</button>
              </form>
            ) : null}
            <Link className="btn-ghost" href={`/leagues/${leagueId}/draft`}>Open draft room ↗</Link>
          </div>
        </div>
        <div className="panel-tight">
          <div className="text-xs uppercase text-slate-400">Draft order</div>
          <ol className="mt-1 list-decimal pl-5 text-sm">
            {league.members.map((m) => (
              <li key={m.id} className={m.userId === state?.currentPlayerUserId ? "font-semibold text-amber-300" : ""}>
                {m.displayName}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {state?.status === "active" && state.currentPlayerUserId ? (
        <section className="panel">
          <h2 className="text-lg font-bold mb-2">Admin override pick</h2>
          <p className="text-sm text-slate-400 mb-3">
            Submit the current pick on behalf of {currentPlayer?.displayName ?? "the player"}.
          </p>
          <AdminOverridePicker leagueId={leagueId} />
        </section>
      ) : null}

      <section className="panel">
        <h2 className="text-lg font-bold mb-2">Recent picks</h2>
        {league.draftPicks.length === 0 ? (
          <div className="text-slate-400 text-sm">No picks yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Overall</th>
                <th>Round</th>
                <th>Category</th>
                <th>Player</th>
                <th>Pick</th>
                <th>Odds</th>
              </tr>
            </thead>
            <tbody>
              {league.draftPicks.map((p) => (
                <tr key={p.id}>
                  <td>#{p.overallPickNumber}</td>
                  <td>{p.roundNumber}</td>
                  <td>{CATEGORY_LABELS[p.category as Category]}</td>
                  <td>{p.player.displayName}</td>
                  <td>{p.draftableEntity.athleteName ? `${p.draftableEntity.athleteName} (${p.draftableEntity.schoolName})` : p.draftableEntity.schoolName}</td>
                  <td className="tabular-nums">{p.lockedOdds > 0 ? `+${p.lockedOdds}` : p.lockedOdds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

async function AdminOverridePicker({ leagueId }: { leagueId: string }) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { draftState: true },
  });
  if (!league || !league.draftState?.currentSegmentId) return null;
  const seg = await prisma.draftSegment.findUnique({
    where: { id: league.draftState.currentSegmentId },
  });
  if (!seg) return null;

  // Already drafted entity ids (global exclusivity for safety; UI only)
  const taken = new Set<string>(
    (await prisma.draftPick.findMany({ where: { leagueId }, select: { draftableEntityId: true } })).map(
      (r) => r.draftableEntityId,
    ),
  );

  const candidates = await prisma.draftableEntity.findMany({
    where: { leagueId, locked: true },
    orderBy: [{ oddsAmerican: "asc" }],
  });
  const eligible = candidates.filter((e) => {
    const cats: string[] = JSON.parse(e.eligibleCategoriesJson);
    return cats.includes(seg.category) && !taken.has(e.id);
  });

  return (
    <form action={adminOverrideAction.bind(null, leagueId)} className="grid md:grid-cols-3 gap-3 items-end">
      <label className="text-sm md:col-span-2">
        <span className="label">Entity ({seg.category})</span>
        <select name="draftableEntityId" required className="input">
          {eligible.map((e) => (
            <option key={e.id} value={e.id}>
              {e.athleteName ? `${e.athleteName} - ${e.schoolName}` : e.schoolName} {e.conference ? `(${e.conference})` : ""} • {e.oddsAmerican > 0 ? `+${e.oddsAmerican}` : e.oddsAmerican}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="label">Reason</span>
        <input name="reason" required className="input" placeholder="Player unreachable, etc." />
      </label>
      <div className="md:col-span-3">
        <button className="btn-danger">Override pick</button>
      </div>
    </form>
  );
}
