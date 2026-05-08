import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish, trashChannel } from "@/lib/events";
import { readLeagueSettings } from "@/lib/leagueSettings";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ leagueId: string; postId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { leagueId, postId } = await params;
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  const settings = readLeagueSettings(league);
  const post = await prisma.trashTalkPost.findUnique({ where: { id: postId } });
  if (!post || post.leagueId !== leagueId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = post.userId === user.id;
  if (user.role !== "admin" && !(isOwner && settings.trashTalkAllowSelfDelete)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.trashTalkPost.update({
    where: { id: postId },
    data: { deleted: true },
  });
  publish(trashChannel(leagueId), { type: "trash.delete" });

  const posts = await prisma.trashTalkPost.findMany({
    where: { leagueId, deleted: false },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { displayName: true } } },
    take: 100,
  });
  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      body: p.body,
      userId: p.userId,
      author: p.user.displayName,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
