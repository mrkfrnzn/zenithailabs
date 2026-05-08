import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS, Category } from "@/lib/categories";
import { readLeagueSettings } from "@/lib/leagueSettings";
import Link from "next/link";

export default async function LeagueOverview({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
      draftSegments: { orderBy: { segmentOrder: "asc" } },
      draftState: true,
      _count: { select: { draftPicks: true, draftableEntities: true } },
    },
  });
  if (!league) notFound();
  const settings = readLeagueSettings(league);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="panel md:col-span-2 space-y-4">
        <div>
          <h2 className="text-lg font-bold mb-2">Players</h2>
          <ol className="list-decimal pl-5 text-sm space-y-1">
            {league.members.map((m) => (
              <li key={m.id} className={m.userId === league.draftState?.currentPlayerUserId ? "text-amber-300 font-semibold" : ""}>
                {m.displayName}
                {m.userId === league.draftState?.currentPlayerUserId ? <span className="ml-2 badge-amber">On the clock</span> : null}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="text-lg font-bold mb-2">Draft segments</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {league.draftSegments.map((s) => (
              <div key={s.id} className="panel-tight">
                <div className="text-xs text-slate-400 uppercase">Segment {s.segmentOrder}</div>
                <div className="font-bold">{CATEGORY_LABELS[s.category as Category]}</div>
                <div className="text-slate-300 text-sm">{s.pickCountPerPlayer} picks per player</div>
                <div className="mt-1 text-xs text-slate-500">Status: {s.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel space-y-3">
        <div>
          <div className="text-xs uppercase text-slate-400">Picks made</div>
          <div className="text-3xl font-extrabold">{league._count.draftPicks}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Draftable entities</div>
          <div className="text-3xl font-extrabold">{league._count.draftableEntities}</div>
        </div>
        <div className="text-xs text-slate-500">
          Exclusivity: <span className="badge-slate">{settings.exclusivity}</span>
        </div>
        <Link href={`/leagues/${leagueId}/draft`} className="btn-primary w-full mt-2 text-center">
          Go to draft room
        </Link>
      </div>

      <div className="panel md:col-span-3">
        <h2 className="text-lg font-bold mb-2">Recent picks</h2>
        <RecentPicks leagueId={leagueId} />
      </div>
    </div>
  );
}

async function RecentPicks({ leagueId }: { leagueId: string }) {
  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    include: { player: true, draftableEntity: true },
    orderBy: { overallPickNumber: "desc" },
    take: 10,
  });
  if (picks.length === 0) return <div className="text-slate-400 text-sm">No picks yet.</div>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Round</th>
          <th>Category</th>
          <th>Player</th>
          <th>Pick</th>
          <th>Odds</th>
        </tr>
      </thead>
      <tbody>
        {picks.map((p) => (
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
  );
}
