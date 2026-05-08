import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireLeagueMember } from "@/lib/auth";
import { CATEGORY_LABELS, Category } from "@/lib/categories";

export default async function DraftBoardPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  await requireLeagueMember(leagueId);
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
      draftSegments: { orderBy: { segmentOrder: "asc" } },
    },
  });
  if (!league) notFound();
  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    include: { draftableEntity: true, player: true },
    orderBy: { overallPickNumber: "asc" },
  });

  // Group by member then by category
  const memberPicks = new Map<string, typeof picks>();
  for (const m of league.members) memberPicks.set(m.userId, []);
  for (const p of picks) memberPicks.get(p.playerUserId)?.push(p);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Draft board</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {league.members.map((m) => {
          const list = memberPicks.get(m.userId) ?? [];
          const grouped = new Map<string, typeof list>();
          for (const p of list) {
            if (!grouped.has(p.category)) grouped.set(p.category, []);
            grouped.get(p.category)!.push(p);
          }
          return (
            <div key={m.id} className="panel">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold">{m.displayName}</div>
                <span className="badge-slate">Slot {m.draftPosition}</span>
              </div>
              {league.draftSegments.map((s) => {
                const items = grouped.get(s.category) ?? [];
                if (items.length === 0) {
                  return (
                    <div key={s.id} className="mb-3">
                      <div className="text-xs uppercase text-slate-500">{CATEGORY_LABELS[s.category as Category]}</div>
                      <div className="text-slate-500 text-xs">—</div>
                    </div>
                  );
                }
                return (
                  <div key={s.id} className="mb-3">
                    <div className="text-xs uppercase text-slate-500">{CATEGORY_LABELS[s.category as Category]}</div>
                    <ul className="text-sm">
                      {items.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2">
                          <span>
                            {p.draftableEntity.athleteName
                              ? `${p.draftableEntity.athleteName} (${p.draftableEntity.schoolName})`
                              : p.draftableEntity.schoolName}
                          </span>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {p.lockedOdds > 0 ? `+${p.lockedOdds}` : p.lockedOdds}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
