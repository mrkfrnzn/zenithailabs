import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export default async function LeagueListPage() {
  const user = await requireUser();
  const memberships = await prisma.leagueMember.findMany({
    where: user.role === "admin" ? {} : { userId: user.id },
    include: { league: true },
    orderBy: { createdAt: "desc" },
  });
  // Admins also see all leagues they created in case they're not a member
  const adminCreated =
    user.role === "admin"
      ? await prisma.league.findMany({ where: { createdById: user.id }, orderBy: { createdAt: "desc" } })
      : [];

  const seen = new Set<string>();
  const leagues = [
    ...memberships.map((m) => m.league),
    ...adminCreated,
  ].filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My leagues</h1>
      {leagues.length === 0 ? (
        <div className="panel text-slate-400">No leagues yet. Ask your commissioner to add you.</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((l) => (
            <Link key={l.id} href={`/leagues/${l.id}`} className="panel hover:border-amber-500/40 transition">
              <div className="text-xs text-slate-400">{l.seasonYear}</div>
              <div className="text-lg font-bold">{l.name}</div>
              <div className="mt-2"><StatusBadge status={l.status} /></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
