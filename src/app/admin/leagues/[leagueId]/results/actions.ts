"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { parseUploadedFile } from "@/lib/uploads";
import { parseResultRows, resultTypeToCategory } from "@/lib/resultsParser";
import { recalculateAllScores } from "@/lib/scoringRunner";
import { normalizeName } from "@/lib/normalize";

const ALLOWED_RESULT_TYPES = new Set(["heisman", "cfp", "cinderella", "conference"]);

function err(leagueId: string, message: string) {
  redirect(`/admin/leagues/${leagueId}/results?err=${encodeURIComponent(message)}`);
}

export async function uploadResultsAction(leagueId: string, formData: FormData) {
  const admin = await requireAdmin();
  const file = formData.get("file") as File | null;
  const resultType = String(formData.get("resultType") ?? "");
  if (!ALLOWED_RESULT_TYPES.has(resultType)) {
    err(leagueId, "Unknown result type.");
  }
  if (!file || file.size === 0) {
    err(leagueId, "Please choose a file.");
  }

  let parsed;
  try {
    parsed = await parseUploadedFile(file as File);
  } catch (e) {
    err(leagueId, e instanceof Error ? e.message : "Failed to parse file.");
  }

  const rows = parseResultRows(resultType, parsed!.rows);

  // Build normalized name map of draftable entities for auto-matching.
  const category = resultTypeToCategory(resultType);
  const entities = await prisma.draftableEntity.findMany({ where: { leagueId } });
  const matchMap = new Map<string, string>(); // normalizedName → entityId (eligible for category)
  const ambiguous = new Set<string>();
  for (const e of entities) {
    let cats: string[] = [];
    try {
      cats = JSON.parse(e.eligibleCategoriesJson);
    } catch {
      // ignore
    }
    if (!cats.includes(category)) continue;
    if (matchMap.has(e.normalizedName)) {
      ambiguous.add(e.normalizedName);
    } else {
      matchMap.set(e.normalizedName, e.id);
    }
  }

  const importRow = await prisma.resultImport.create({
    data: {
      leagueId,
      resultType,
      fileName: file!.name,
      status: "draft",
      rawRowsJson: JSON.stringify(parsed!.rows),
      createdById: admin.id,
    },
  });

  for (const r of rows) {
    const matchKey = r.normalized.matchKey || normalizeName(r.normalized.athleteName ?? r.normalized.schoolName ?? "");
    const matchedId = matchMap.get(matchKey);
    const isAmbiguous = ambiguous.has(matchKey);
    let matchStatus: "matched" | "unmatched" | "conflict" = "unmatched";
    if (matchedId && !isAmbiguous) matchStatus = "matched";
    else if (isAmbiguous) matchStatus = "conflict";
    if (r.errors.length > 0) matchStatus = "unmatched";

    await prisma.resultRow.create({
      data: {
        resultImportId: importRow.id,
        leagueId,
        matchedEntityId: matchedId && !isAmbiguous ? matchedId : null,
        rawRowJson: JSON.stringify(r.rawRow),
        normalizedValuesJson: JSON.stringify(r.normalized),
        outcome: r.normalized.outcome ?? null,
        matchStatus,
        adminNotes: r.errors.length > 0 ? r.errors.join("; ") : null,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "results.upload",
      entityType: "ResultImport",
      entityId: importRow.id,
      afterJson: JSON.stringify({ resultType, fileName: file!.name, rows: rows.length }),
    },
  });

  redirect(
    `/admin/leagues/${leagueId}/results?msg=${encodeURIComponent(
      `Uploaded ${rows.length} rows. Review matches below.`,
    )}&importId=${importRow.id}`,
  );
}

export async function updateRowMatchAction(
  leagueId: string,
  rowId: string,
  formData: FormData,
) {
  await requireAdmin();
  const entityId = String(formData.get("entityId") ?? "");
  const row = await prisma.resultRow.findUnique({ where: { id: rowId } });
  if (!row || row.leagueId !== leagueId) return;
  if (entityId) {
    await prisma.resultRow.update({
      where: { id: rowId },
      data: { matchedEntityId: entityId, matchStatus: "manual" },
    });
  } else {
    await prisma.resultRow.update({
      where: { id: rowId },
      data: { matchedEntityId: null, matchStatus: "unmatched" },
    });
  }
  revalidatePath(`/admin/leagues/${leagueId}/results`);
}

export async function updateRowOutcomeAction(
  leagueId: string,
  rowId: string,
  formData: FormData,
) {
  await requireAdmin();
  const outcome = String(formData.get("outcome") ?? "") || null;
  const row = await prisma.resultRow.findUnique({ where: { id: rowId } });
  if (!row || row.leagueId !== leagueId) return;
  await prisma.resultRow.update({
    where: { id: rowId },
    data: { outcome },
  });
  revalidatePath(`/admin/leagues/${leagueId}/results`);
}

export async function ignoreRowAction(leagueId: string, rowId: string) {
  await requireAdmin();
  const row = await prisma.resultRow.findUnique({ where: { id: rowId } });
  if (!row || row.leagueId !== leagueId) return;
  await prisma.resultRow.update({
    where: { id: rowId },
    data: { matchStatus: "ignored" },
  });
  revalidatePath(`/admin/leagues/${leagueId}/results`);
}

export async function applyImportAction(leagueId: string, importId: string) {
  const admin = await requireAdmin();
  const imp = await prisma.resultImport.findUnique({
    where: { id: importId },
    include: { rows: true },
  });
  if (!imp || imp.leagueId !== leagueId) return;

  const unresolved = imp.rows.filter(
    (r) => r.matchStatus === "unmatched" || r.matchStatus === "conflict",
  ).length;
  if (unresolved > 0) {
    err(
      leagueId,
      `Cannot apply: ${unresolved} unresolved rows. Match them or mark as ignored first.`,
    );
  }

  await prisma.resultImport.update({
    where: { id: importId },
    data: { status: "applied" },
  });

  try {
    await recalculateAllScores(leagueId);
  } catch (e) {
    err(leagueId, e instanceof Error ? e.message : "Recalculation failed.");
  }

  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "results.apply",
      entityType: "ResultImport",
      entityId: importId,
    },
  });

  redirect(
    `/admin/leagues/${leagueId}/standings-review?msg=${encodeURIComponent(
      "Results applied. Scores recalculated.",
    )}`,
  );
}

export async function deleteImportAction(leagueId: string, importId: string) {
  const admin = await requireAdmin();
  const imp = await prisma.resultImport.findUnique({ where: { id: importId } });
  if (!imp || imp.leagueId !== leagueId) return;
  const wasApplied = imp.status === "applied";
  await prisma.resultImport.delete({ where: { id: importId } });
  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "results.delete",
      entityType: "ResultImport",
      entityId: importId,
    },
  });
  if (wasApplied) {
    // Recompute since this import contributed to scoring.
    try {
      await recalculateAllScores(leagueId);
    } catch {
      // ignore
    }
  }
  revalidatePath(`/admin/leagues/${leagueId}/results`);
}
