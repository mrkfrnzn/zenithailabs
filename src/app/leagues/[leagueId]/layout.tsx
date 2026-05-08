import Link from "next/link";
import { ReactNode } from "react";
import { requireLeagueMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";

export default async function LeagueLayout({
  params,
  children,
}: {
  params: Promise<{ leagueId: string }>;
  children: ReactNode;
}) {
  const { leagueId } = await params;
  await requireLeagueMember(leagueId);
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) notFound();

  return (
    <div className="space-y-5">
      {/* League header */}
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{league.name}</h1>
          <span className="text-slate-500 text-sm">{league.seasonYear} Season</span>
        </div>
        <StatusBadge status={league.status} />
      </div>

      {/* Tab nav */}
      <nav className="flex flex-wrap gap-1.5 text-sm border-b border-[#1e2d45] pb-3">
        <Tab href={`/leagues/${leagueId}`} label="Overview" />
        <Tab href={`/leagues/${leagueId}/draft`} label="Draft Room" />
        <Tab href={`/leagues/${leagueId}/draft-board`} label="Draft Board" />
        <Tab href={`/leagues/${leagueId}/war-chest`} label="War Chest" />
        <Tab href={`/leagues/${leagueId}/standings`} label="Standings" />
        <Tab href={`/leagues/${leagueId}/trash-talk`} label="Trash Talk" />
      </nav>

      <div>{children}</div>
    </div>
  );
}

function Tab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg bg-[#0f1929] border border-[#1e2d45] text-slate-400 hover:text-amber-400 hover:border-amber-500/40 hover:bg-[#152033] transition-all"
    >
      {label}
    </Link>
  );
}
