import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitPick } from "@/lib/draftEngine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const user = await getSessionUser();
  const { leagueId } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Players: must be a member. Admins: allowed without membership.
  if (user.role !== "admin") {
    const member = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: user.id } },
    });
    if (!member) return NextResponse.json({ error: "Not a member of this league." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const draftableEntityId = String(body?.draftableEntityId ?? "");
  if (!draftableEntityId) return NextResponse.json({ error: "Missing entity id." }, { status: 400 });

  try {
    await submitPick(leagueId, user.id, draftableEntityId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pick failed." },
      { status: 400 },
    );
  }
}
