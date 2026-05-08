import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish, trashChannel } from "@/lib/events";
import { readLeagueSettings } from "@/lib/leagueSettings";

async function ensureMember(leagueId: string, userId: string, role: string) {
  if (role === "admin") return true;
  const m = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  return !!m;
}

async function listPosts(leagueId: string) {
  const posts = await prisma.trashTalkPost.findMany({
    where: { leagueId, deleted: false },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { displayName: true } } },
    take: 100,
  });
  return posts.map((p) => ({
    id: p.id,
    body: p.body,
    userId: p.userId,
    author: p.user.displayName,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const user = await getSessionUser();
  const { leagueId } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureMember(leagueId, user.id, user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ posts: await listPosts(leagueId) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const user = await getSessionUser();
  const { leagueId } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureMember(leagueId, user.id, user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  const settings = readLeagueSettings(league);
  if (!settings.trashTalkEnabled)
    return NextResponse.json({ error: "Trash talk is disabled." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = String(body?.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Message body required." }, { status: 400 });
  if (text.length > 2000)
    return NextResponse.json({ error: "Message too long." }, { status: 400 });

  await prisma.trashTalkPost.create({
    data: { leagueId, userId: user.id, body: text },
  });
  publish(trashChannel(leagueId), { type: "trash.create" });

  return NextResponse.json({ posts: await listPosts(leagueId) });
}
