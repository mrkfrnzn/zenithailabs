import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export default async function AdminHome() {
  await requireAdmin();
  const leagues = await prisma.league.findMany({
    include: { _count: { select: { members: true, draftableEntities: true, draftPicks: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Commissioner Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage your CFB War Chest leagues.</p>
        </div>
        <Link href="/admin/leagues/new" className="btn-primary">+ New League</Link>
      </div>

      {leagues.length === 0 ? (
        <div className="panel border-dashed border-[#263a56] text-center py-12">
          <div className="text-slate-500 mb-3">No leagues yet.</div>
          <Link href="/admin/leagues/new" className="btn-primary">Create your first league</Link>
        </div>
      ) : (
        <div className="panel-tight overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>League</th>
                <th>Season</th>
                <th>Status</th>
                <th className="text-right">Players</th>
                <th className="text-right">Pool</th>
                <th className="text-right">Picks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leagues.map((l) => (
                <tr key={l.id}>
                  <td className="font-semibold text-white">{l.name}</td>
                  <td className="text-slate-400">{l.seasonYear}</td>
                  <td><StatusBadge status={l.status} /></td>
                  <td className="text-right text-slate-300">{l._count.members}</td>
                  <td className="text-right text-slate-300">{l._count.draftableEntities}</td>
                  <td className="text-right text-slate-300">{l._count.draftPicks}</td>
                  <td className="text-right">
                    <Link className="text-amber-400 hover:text-amber-300 font-medium text-sm hover:underline" href={`/admin/leagues/${l.id}`}>
                      Manage →
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
