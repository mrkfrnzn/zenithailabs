import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireLeagueMember } from "@/lib/auth";
import { CATEGORIES, CATEGORY_LABELS, Category } from "@/lib/categories";
import Link from "next/link";

export default async function WarChestPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  const { leagueId } = await params;
  const { user } = await requireLeagueMember(leagueId);
  const sp = await searchParams;
  const focusUserId = sp.user ?? user.id;

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
    },
  });
  if (!league) notFound();

  const focus = league.members.find((m) => m.userId === focusUserId) ?? league.members[0];
  if (!focus) {
    return <div className="panel text-slate-400">No players in this league.</div>;
  }

  const picks = await prisma.draftPick.findMany({
    where: { leagueId, playerUserId: focus.userId },
    include: { draftableEntity: true, scores: { where: { published: true } } },
    orderBy: [{ category: "asc" }, { overallPickNumber: "asc" }],
  });

  const grouped = new Map<string, typeof picks>();
  for (const p of picks) {
    if (!grouped.has(p.category)) grouped.set(p.category, []);
    grouped.get(p.category)!.push(p);
  }

  let total = 0;
  for (const p of picks) {
    if (p.scores[0]?.published) total += p.scores[0].points;
  }

  // Per-category point totals
  const catTotals: Record<string, number> = {};
  for (const p of picks) {
    if (p.scores[0]?.published) {
      catTotals[p.category] = (catTotals[p.category] ?? 0) + p.scores[0].points;
    }
  }

  const CATEGORY_BADGE: Record<string, string> = {
    heisman: "badge-amber",
    cfp: "badge-blue",
    cinderella: "badge-green",
    conference_champion: "badge-red",
  };

  return (
    <div className="space-y-5">
      {/* Player switcher */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-slate-500 uppercase tracking-wider mr-1">View:</span>
        {league.members.map((m) => (
          <Link
            key={m.id}
            href={`/leagues/${leagueId}/war-chest?user=${m.userId}`}
            className={
              m.userId === focusUserId
                ? "px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 text-sm font-bold shadow-gold-sm"
                : "px-3 py-1.5 rounded-lg bg-[#0f1929] border border-[#1e2d45] text-slate-400 text-sm hover:text-amber-400 hover:border-amber-500/40 transition-all"
            }
          >
            {m.displayName}
          </Link>
        ))}
      </div>

      {/* War Chest summary card */}
      <div className="panel-gold">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="section-header">War Chest</div>
            <div className="text-2xl font-extrabold text-white">{focus.displayName}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-4xl font-black tabular-nums text-amber-400">
              {Math.round(total * 100) / 100}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">total pts</div>
          </div>
        </div>
        {/* Category sub-totals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#1e2d45]">
          {CATEGORIES.map((c) => (
            <div key={c} className="text-center">
              <div className={`${CATEGORY_BADGE[c]} mb-1`}>{CATEGORY_LABELS[c as Category]}</div>
              <div className="text-lg font-bold tabular-nums text-white">
                {Math.round((catTotals[c] ?? 0) * 100) / 100}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category picks */}
      {CATEGORIES.map((c) => {
        const items = grouped.get(c) ?? [];
        return (
          <section key={c} className="panel">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <span className={CATEGORY_BADGE[c]}>{CATEGORY_LABELS[c as Category]}</span>
              {items.length > 0 && (
                <span className="text-xs text-slate-500">{items.length} pick{items.length !== 1 ? "s" : ""}</span>
              )}
            </h2>
            {items.length === 0 ? (
              <div className="text-slate-500 text-sm italic">No picks in this category.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Selection</th>
                    <th>Conf</th>
                    <th className="text-right">Locked Odds</th>
                    <th>Outcome</th>
                    <th className="text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const score = p.scores[0];
                    return (
                      <tr key={p.id}>
                        <td className="font-semibold text-white">
                          {p.draftableEntity.athleteName
                            ? `${p.draftableEntity.athleteName} `
                            : ""}
                          <span className={p.draftableEntity.athleteName ? "text-slate-400 font-normal" : ""}>
                            {p.draftableEntity.athleteName ? `(${p.draftableEntity.schoolName})` : p.draftableEntity.schoolName}
                          </span>
                        </td>
                        <td className="text-slate-500">{p.draftableEntity.conference ?? "—"}</td>
                        <td className="text-right">
                          <span className="odds-chip">
                            {p.lockedOdds > 0 ? `+${p.lockedOdds}` : p.lockedOdds}
                          </span>
                        </td>
                        <td>
                          {score ? (
                            <span className="badge-blue">{score.outcome.replace(/_/g, " ")}</span>
                          ) : (
                            <span className="text-slate-600 text-xs italic">pending</span>
                          )}
                        </td>
                        <td className="text-right tabular-nums font-bold text-amber-400">
                          {score ? Math.round(score.points * 100) / 100 : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
