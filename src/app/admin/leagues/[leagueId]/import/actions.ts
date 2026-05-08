"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { parseUploadedFile } from "@/lib/uploads";
import { normalizeName, parseAmericanOdds, parseInteger } from "@/lib/normalize";
import { CATEGORIES, Category } from "@/lib/categories";

const CAT_SET = new Set<string>(CATEGORIES);

export async function uploadPreseasonAction(leagueId: string, formData: FormData) {
  const admin = await requireAdmin();
  const file = formData.get("file") as File | null;
  const replace = formData.get("replace") === "1";
  if (!file || file.size === 0) {
    redirect(`/admin/leagues/${leagueId}/import?err=${encodeURIComponent("Please choose a file.")}`);
  }
  let parsed;
  try {
    parsed = await parseUploadedFile(file as File);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to parse file.";
    redirect(`/admin/leagues/${leagueId}/import?err=${encodeURIComponent(msg)}`);
  }

  if (replace) {
    // Block if draft state is past setup
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (league && (league.status === "drafting" || league.status === "drafted")) {
      redirect(
        `/admin/leagues/${leagueId}/import?err=${encodeURIComponent("Cannot replace entities once draft has started.")}`,
      );
    }
    await prisma.draftableEntity.deleteMany({ where: { leagueId } });
  }

  let imported = 0;
  let skipped = 0;
  for (const row of parsed!.rows) {
    const entityType = (row.entity_type || row.type || "").toLowerCase();
    if (entityType !== "athlete" && entityType !== "school") {
      skipped++;
      continue;
    }
    const schoolName = (row.school_name || row.school || "").trim();
    if (!schoolName) {
      skipped++;
      continue;
    }
    const athleteName = (row.athlete_name || row.athlete || "").trim();
    const odds = parseAmericanOdds(row.odds);
    const preseasonRank = parseInteger(row.preseason_rank);
    const conference = (row.conference || "").trim() || null;
    const position = (row.position || "").trim() || null;
    const source = (row.source || "").trim() || null;
    const catRaw = (row.eligible_categories || row.category || "").trim();
    const cats = catRaw
      .split(/[;,|]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => CAT_SET.has(s)) as Category[];

    const normalized = normalizeName(athleteName || schoolName);

    await prisma.draftableEntity.create({
      data: {
        leagueId,
        entityType,
        athleteName: athleteName || null,
        schoolName,
        conference,
        position,
        preseasonRank,
        oddsAmerican: odds?.value ?? 0,
        oddsSource: source,
        eligibleCategoriesJson: JSON.stringify(cats),
        rawImportJson: JSON.stringify(row),
        normalizedName: normalized,
      },
    });
    imported++;
  }

  // Bump status
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: imported > 0 ? "data_imported" : undefined },
  });

  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "import.preseason",
      afterJson: JSON.stringify({ fileName: file!.name, imported, skipped, replace }),
    },
  });

  redirect(
    `/admin/leagues/${leagueId}/import?msg=${encodeURIComponent(`Imported ${imported} rows (skipped ${skipped}).`)}`,
  );
}

export async function updateEntityAction(
  leagueId: string,
  entityId: string,
  formData: FormData,
) {
  await requireAdmin();
  const odds = parseAmericanOdds(formData.get("oddsAmerican"));
  const data: Record<string, unknown> = {};
  if (odds) data.oddsAmerican = odds.value;
  // Allow text edits if provided
  for (const f of ["schoolName", "athleteName", "conference", "position"]) {
    const v = formData.get(f);
    if (v !== null && String(v).length > 0) data[f] = String(v).trim();
  }
  const rank = formData.get("preseasonRank");
  if (rank !== null && String(rank) !== "") data.preseasonRank = parseInteger(rank);
  if (Object.keys(data).length > 0) {
    await prisma.draftableEntity.update({ where: { id: entityId }, data });
  }
  revalidatePath(`/admin/leagues/${leagueId}/import`);
}

export async function deleteEntityAction(leagueId: string, entityId: string) {
  await requireAdmin();
  // Block if any draft picks reference it
  const usage = await prisma.draftPick.count({ where: { draftableEntityId: entityId } });
  if (usage > 0) return;
  await prisma.draftableEntity.delete({ where: { id: entityId } });
  revalidatePath(`/admin/leagues/${leagueId}/import`);
}

export async function toggleCategoryAction(
  leagueId: string,
  entityId: string,
  category: string,
) {
  await requireAdmin();
  const e = await prisma.draftableEntity.findUnique({ where: { id: entityId } });
  if (!e) return;
  const cats = new Set<string>(JSON.parse(e.eligibleCategoriesJson));
  if (cats.has(category)) cats.delete(category);
  else cats.add(category);
  await prisma.draftableEntity.update({
    where: { id: entityId },
    data: { eligibleCategoriesJson: JSON.stringify([...cats]) },
  });
  revalidatePath(`/admin/leagues/${leagueId}/import`);
}

export async function lockDraftPoolAction(leagueId: string) {
  const admin = await requireAdmin();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return;
  await prisma.draftableEntity.updateMany({
    where: { leagueId },
    data: { locked: true },
  });
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "draft_ready" },
  });
  // Also lock scoring configs
  await prisma.scoringConfig.updateMany({ where: { leagueId }, data: { locked: true } });
  await prisma.auditLog.create({
    data: { leagueId, actorUserId: admin.id, action: "draft_pool.lock" },
  });
  revalidatePath(`/admin/leagues/${leagueId}/import`);
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function unlockDraftPoolAction(leagueId: string) {
  const admin = await requireAdmin();
  const state = await prisma.draftState.findUnique({ where: { leagueId } });
  if (state && state.status !== "not_started") return;
  await prisma.draftableEntity.updateMany({
    where: { leagueId },
    data: { locked: false },
  });
  await prisma.scoringConfig.updateMany({ where: { leagueId }, data: { locked: false } });
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "data_imported" },
  });
  await prisma.auditLog.create({
    data: { leagueId, actorUserId: admin.id, action: "draft_pool.unlock" },
  });
  revalidatePath(`/admin/leagues/${leagueId}/import`);
  revalidatePath(`/admin/leagues/${leagueId}`);
}
