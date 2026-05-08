import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireLeagueMember } from "@/lib/auth";
import { CATEGORIES, CATEGORY_LABELS, Category } from "@/lib/categories";
import { readLeagueSettings } from "@/lib/leagueSettings";
import Link from "next/link";

export default async function StandingsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const { user } = await requireLeagueMember(leagueId);
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
    },
  });
  if (!league) notFound();
  const settings = readLeagueSettings(league);
  const isAdmin = user.role === "admin";

  // Only published unless setting allows
  const scoreFilter = settings.publishProvisionalStandings || isAdmin
    ? {}
    : { published: true };

  const scores = await prisma.score.findMany({
    where: { leagueId, ...scoreFilter },
    include: { draftPick: { include: { draftableEntity: true } } },
  });

  // Build per-player totals and breakdown
  type Row = {
    userId: string;
    displayName: string;
    total: number;
    perCategory: Record<Category, number>;
    cinderellaBest: number; // best (lowest positive) final AP rank
  };
  const rows = new Map<string, Row>();
  for (const m of league.members) {
    const init: Row = {
      userId: m.userId,
      displayName: m.displayName,
      total: 0,
      perCategory: { heisman: 0, cfp: 0, cinderella: 0, conference_champion: 0 },
      cinderellaBest: 999,
    };
    rows.set(m.userId, init);
  }

  for (const s of scores) {
    const r = rows.get(s.draftPick.playerUserId);
    if (!r) continue;
    r.total += s.points;
    r.perCategory[s.category as Category] = (r.perCategory[s.category as Category] ?? 0) + s.points;
    // Tiebreaker: best Cinderella final AP rank
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

  const lastUpdated = await prisma.score.findFirst({
    where: { leagueId },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  const leader = sorted[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Standings</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {settings.publishProvisionalStandings && <span className="badge-amber">Provisional</span>}
          {lastUpdated
            ? `Updated ${lastUpdated.updatedAt.toLocaleString()}`
            : "No scoring yet."}
        </div>
      </div>

      {/* Leader spotlight */}
      {leader && leader.total > 0 && (
        <div className="panel-gold flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-lg">
            1
          </div>
          <div className="flex-1">
            <div className="text-xs text-amber-400/70 font-semibold uppercase tracking-wider">Leading the chest</div>
            <div className="text-xl font-extrabold text-white">{leader.displayName}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black tabular-nums text-amber-400">
              {Math.round(leader.total * 100) / 100}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">pts</div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="panel text-slate-400">No standings yet.</div>
      ) : (
        <div className="panel-tight overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Player</th>
                <th className="text-right font-bold">Total</th>
                {CATEGORIES.map((c) => (
                  <th key={c} className="text-right">
                    {CATEGORY_LABELS[c]}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr key={r.userId} className={idx === 0 && r.total > 0 ? "bg-amber-500/5" : ""}>
                  <td>
                    <span
                      className={
                        idx === 0
                          ? "w-7 h-7 inline-flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-black text-xs"
                          : "text-slate-500 text-sm font-semibold"
                      }
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="font-semibold">{r.displayName}</td>
                  <td className="text-right tabular-nums font-extrabold text-amber-400">
                    {Math.round(r.total * 100) / 100}
                  </td>
                  {CATEGORIES.map((c) => (
                    <td key={c} className="text-right tabular-nums text-slate-300">
                      {Math.round((r.perCategory[c] ?? 0) * 100) / 100}
                    </td>
                  ))}
                  <td className="text-right">
                    <Link
                      className="text-amber-400 text-sm hover:underline"
                      href={`/leagues/${leagueId}/war-chest?user=${r.userId}`}
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
