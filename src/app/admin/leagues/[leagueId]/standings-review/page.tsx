import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS, Category } from "@/lib/categories";
import { recalculateAction, publishAction } from "./actions";

export default async function StandingsReview({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdmin();
  const { leagueId } = await params;
  const sp = await searchParams;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
    },
  });
  if (!league) notFound();

  const scores = await prisma.score.findMany({
    where: { leagueId },
    include: { draftPick: { include: { draftableEntity: true } } },
  });

  type Row = {
    userId: string;
    displayName: string;
    total: number;
    perCategory: Record<Category, number>;
    cinderellaBest: number;
  };

  const rows = new Map<string, Row>();
  for (const m of league.members) {
    rows.set(m.userId, {
      userId: m.userId,
      displayName: m.displayName,
      total: 0,
      perCategory: { heisman: 0, cfp: 0, cinderella: 0, conference_champion: 0 },
      cinderellaBest: 999,
    });
  }
  for (const s of scores) {
    const r = rows.get(s.draftPick.playerUserId);
    if (!r) continue;
    r.total += s.points;
    r.perCategory[s.category as Category] = (r.perCategory[s.category as Category] ?? 0) + s.points;
    if (s.category === "cinderella") {
      try {
        const calc = JSON.parse(s.calculationJson || "{}");
        const finalRank = Number(calc.finalApRank ?? Number.NaN);
        if (Number.isFinite(finalRank) && finalRank > 0 && finalRank < r.cinderellaBest) {
          r.cinderellaBest = finalRank;
        }
      } catch {
        // ignore
      }
    }
  }

  const sorted = [...rows.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.cinderellaBest - b.cinderellaBest;
  });

  const allPublished = scores.length > 0 && scores.every((s) => s.published);
  const anyUnpublished = scores.some((s) => !s.published);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/leagues/${leagueId}`} className="text-amber-400 text-sm hover:underline">
          ← Back to league
        </Link>
        <h1 className="text-2xl font-bold mt-1">Standings review</h1>
        <p className="text-slate-400 text-sm">
          Review provisional scores and per-pick calculations. Recalculate after applying new results, or publish to make
          standings visible to players.
        </p>
      </div>

      {sp.msg ? (
        <div className="px-3 py-2 rounded bg-green-500/15 border border-green-500/30 text-green-300 text-sm">{sp.msg}</div>
      ) : null}
      {sp.err ? (
        <div className="px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{sp.err}</div>
      ) : null}

      <div className="panel flex flex-wrap gap-3 items-center">
        <form action={recalculateAction.bind(null, leagueId)}>
          <button className="btn-secondary">Recalculate scores</button>
        </form>
        <form action={publishAction.bind(null, leagueId)}>
          <button className="btn-primary" disabled={scores.length === 0}>
            Publish standings
          </button>
        </form>
        <div className="text-sm text-slate-400 ml-auto">
          {scores.length} score rows ·{" "}
          {allPublished ? (
            <span className="badge-green">Published</span>
          ) : anyUnpublished ? (
            <span className="badge-amber">Provisional</span>
          ) : (
            <span className="badge-slate">No scores</span>
          )}
        </div>
      </div>

      <section className="panel-tight overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th className="text-right">Total</th>
              {CATEGORIES.map((c) => (
                <th key={c} className="text-right">
                  {CATEGORY_LABELS[c]}
                </th>
              ))}
              <th className="text-right">Best Cinderella AP</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => (
              <tr key={r.userId}>
                <td className="font-bold">{idx + 1}</td>
                <td>{r.displayName}</td>
                <td className="text-right tabular-nums font-bold">{Math.round(r.total * 100) / 100}</td>
                {CATEGORIES.map((c) => (
                  <td key={c} className="text-right tabular-nums">
                    {Math.round((r.perCategory[c] ?? 0) * 100) / 100}
                  </td>
                ))}
                <td className="text-right tabular-nums text-slate-400">
                  {r.cinderellaBest === 999 ? "—" : r.cinderellaBest}
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={3 + CATEGORIES.length + 1} className="text-center text-slate-500 py-6">
                  No standings yet. Apply at least one results import to compute scores.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">Per-pick scoring detail</h2>
        {scores.length === 0 ? (
          <div className="text-slate-400 text-sm">No scoring rows yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Category</th>
                  <th>Pick</th>
                  <th>Outcome</th>
                  <th className="text-right">Locked Odds</th>
                  <th>Formula</th>
                  <th className="text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {scores
                  .slice()
                  .sort((a, b) => {
                    if (a.draftPick.playerUserId !== b.draftPick.playerUserId)
                      return a.draftPick.playerUserId.localeCompare(b.draftPick.playerUserId);
                    if (a.category !== b.category) return a.category.localeCompare(b.category);
                    return a.draftPick.overallPickNumber - b.draftPick.overallPickNumber;
                  })
                  .map((s) => {
                    const player = league.members.find((m) => m.userId === s.draftPick.playerUserId);
                    let calc: Record<string, unknown> = {};
                    try {
                      calc = JSON.parse(s.calculationJson || "{}");
                    } catch {
                      // ignore
                    }
                    const formula = String(calc.formula ?? "");
                    const ratio =
                      typeof calc.oddsRatio === "number"
                        ? Math.round((calc.oddsRatio as number) * 100) / 100
                        : null;
                    let formulaText = "";
                    if (formula.startsWith("multiplier_x_odds_ratio")) {
                      formulaText = `${calc.multiplier ?? 0} × (${calc.entityOdds ?? 0} / ${
                        calc.lowestDraftedOdds ?? 0
                      })${calc.conferenceGroup ? ` [${calc.conferenceGroup}]` : ""}${
                        ratio !== null ? ` = ${ratio}×` : ""
                      }`;
                    } else if (formula === "fixed_points_by_bucket") {
                      formulaText = `Fixed: ${calc.fixedPoints ?? 0}`;
                    }
                    return (
                      <tr key={s.id}>
                        <td>{player?.displayName ?? "?"}</td>
                        <td>{CATEGORY_LABELS[s.category as Category] ?? s.category}</td>
                        <td>
                          {s.draftPick.draftableEntity.athleteName
                            ? `${s.draftPick.draftableEntity.athleteName} (${s.draftPick.draftableEntity.schoolName})`
                            : s.draftPick.draftableEntity.schoolName}
                        </td>
                        <td>
                          <span className={s.points > 0 ? "badge-green" : "badge-slate"}>{s.outcome}</span>
                        </td>
                        <td className="text-right tabular-nums">
                          {s.draftPick.lockedOdds > 0 ? `+${s.draftPick.lockedOdds}` : s.draftPick.lockedOdds}
                        </td>
                        <td className="text-xs text-slate-400">{formulaText}</td>
                        <td className="text-right tabular-nums font-semibold">
                          {Math.round(s.points * 100) / 100}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
