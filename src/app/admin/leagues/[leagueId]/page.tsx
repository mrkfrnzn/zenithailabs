import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { readLeagueSettings } from "@/lib/leagueSettings";
import { addPlayerAction, removePlayerAction, randomizeOrderAction, setDraftPositionAction } from "./actions";

export default async function LeagueAdmin({ params }: { params: Promise<{ leagueId: string }> }) {
  await requireAdmin();
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
      draftSegments: { orderBy: { segmentOrder: "asc" } },
      _count: { select: { draftableEntities: true, draftPicks: true } },
    },
  });
  if (!league) notFound();
  const settings = readLeagueSettings(league);
  const maxPlayers = (settings as { maxPlayers?: number }).maxPlayers ?? 6;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-400">League · {league.seasonYear}</div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {league.name}
            <StatusBadge status={league.status} />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" href={`/admin/leagues/${league.id}/import`}>Preseason data</Link>
          <Link className="btn-ghost" href={`/admin/leagues/${league.id}/draft-setup`}>Draft setup</Link>
          <Link className="btn-ghost" href={`/admin/leagues/${league.id}/draft-control`}>Draft control</Link>
          <Link className="btn-ghost" href={`/admin/leagues/${league.id}/results`}>Results</Link>
          <Link className="btn-ghost" href={`/admin/leagues/${league.id}/standings-review`}>Standings</Link>
          <Link className="btn-ghost" href={`/leagues/${league.id}/draft`}>Open draft room ↗</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Players" value={league.members.length} sub={`/${maxPlayers} max`} />
        <Stat label="Draftable entities" value={league._count.draftableEntities} sub="across all categories" />
        <Stat label="Picks made" value={league._count.draftPicks} sub="" />
      </div>

      <section className="panel">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Players</h2>
          <form action={randomizeOrderAction.bind(null, league.id)}>
            <button className="btn-ghost text-xs">Randomize draft order</button>
          </form>
        </div>
        <form action={addPlayerAction.bind(null, league.id)} className="grid md:grid-cols-4 gap-3 mb-4">
          <input name="email" type="email" required className="input" placeholder="player@email.com" />
          <input name="displayName" required className="input" placeholder="Display name" />
          <input name="password" type="text" className="input" placeholder="Initial password (min 6)" />
          <button className="btn-primary">Add player</button>
        </form>
        {league.members.length === 0 ? (
          <div className="text-slate-400 text-sm">No players yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Name</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {league.members.map((m, idx) => (
                <tr key={m.id}>
                  <td className="w-24">
                    <form action={setDraftPositionAction.bind(null, league.id, m.id)}>
                      <input
                        name="draftPosition"
                        type="number"
                        min={1}
                        max={league.members.length}
                        defaultValue={m.draftPosition ?? idx + 1}
                        className="input w-20"
                        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                      />
                    </form>
                  </td>
                  <td>{m.displayName}</td>
                  <td className="text-slate-400">{m.user.email}</td>
                  <td className="text-right">
                    <form action={removePlayerAction.bind(null, league.id, m.id)}>
                      <button className="text-red-400 hover:underline text-sm" type="submit">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">Draft segments</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          {league.draftSegments.map((s) => (
            <div key={s.id} className="panel-tight">
              <div className="text-slate-400 text-xs uppercase">Segment {s.segmentOrder}</div>
              <div className="font-bold capitalize">{s.category.replace("_", " ")}</div>
              <div className="text-slate-300 text-sm">{s.pickCountPerPlayer} picks per player</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="panel">
      <div className="text-slate-400 text-xs uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-extrabold">{value}</div>
      <div className="text-slate-500 text-xs">{sub}</div>
    </div>
  );
}
