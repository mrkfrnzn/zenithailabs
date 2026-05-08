import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireLeagueMember } from "@/lib/auth";
import { readLeagueSettings } from "@/lib/leagueSettings";
import { TrashTalkBoard } from "@/components/TrashTalkBoard";

export default async function TrashTalkPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const { user } = await requireLeagueMember(leagueId);
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) notFound();
  const settings = readLeagueSettings(league);

  const posts = await prisma.trashTalkPost.findMany({
    where: { leagueId, deleted: false },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { displayName: true } } },
    take: 100,
  });

  return (
    <TrashTalkBoard
      leagueId={leagueId}
      currentUser={{ id: user.id, displayName: user.displayName, role: user.role }}
      enabled={settings.trashTalkEnabled}
      allowSelfDelete={settings.trashTalkAllowSelfDelete}
      initialPosts={posts.map((p) => ({
        id: p.id,
        body: p.body,
        userId: p.userId,
        author: p.user.displayName,
        createdAt: p.createdAt.toISOString(),
      }))}
    />
  );
}
