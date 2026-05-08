"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recalculateAllScores, publishStandings } from "@/lib/scoringRunner";

function err(leagueId: string, message: string) {
  redirect(`/admin/leagues/${leagueId}/standings-review?err=${encodeURIComponent(message)}`);
}

export async function recalculateAction(leagueId: string) {
  const admin = await requireAdmin();
  try {
    await recalculateAllScores(leagueId);
  } catch (e) {
    err(leagueId, e instanceof Error ? e.message : "Recalculation failed.");
  }
  await prisma.auditLog.create({
    data: { leagueId, actorUserId: admin.id, action: "scores.recalculate" },
  });
  revalidatePath(`/admin/leagues/${leagueId}/standings-review`);
  redirect(
    `/admin/leagues/${leagueId}/standings-review?msg=${encodeURIComponent(
      "Scores recalculated.",
    )}`,
  );
}

export async function publishAction(leagueId: string) {
  const admin = await requireAdmin();
  const count = await prisma.score.count({ where: { leagueId } });
  if (count === 0) {
    err(leagueId, "Nothing to publish. Apply at least one results import first.");
  }
  await publishStandings(leagueId);
  await prisma.auditLog.create({
    data: { leagueId, actorUserId: admin.id, action: "standings.publish" },
  });
  revalidatePath(`/admin/leagues/${leagueId}/standings-review`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  redirect(
    `/admin/leagues/${leagueId}/standings-review?msg=${encodeURIComponent(
      "Standings published. Players can now see them.",
    )}`,
  );
}
