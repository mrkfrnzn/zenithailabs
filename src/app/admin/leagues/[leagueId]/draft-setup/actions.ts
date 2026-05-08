"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { readLeagueSettings, writeLeagueSettings } from "@/lib/leagueSettings";
import type { Category } from "@/lib/categories";

export async function updateSegmentAction(
  leagueId: string,
  segmentId: string,
  formData: FormData,
) {
  await requireAdmin();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return;
  if (league.status === "drafting" || league.status === "drafted") return;
  const order = Number(formData.get("segmentOrder") ?? 1);
  const picks = Number(formData.get("pickCountPerPlayer") ?? 0);
  if (!Number.isInteger(order) || !Number.isInteger(picks)) return;
  // Resolve order conflicts: if another segment has this order, swap
  const conflict = await prisma.draftSegment.findFirst({
    where: { leagueId, segmentOrder: order, NOT: { id: segmentId } },
  });
  if (conflict) {
    const current = await prisma.draftSegment.findUnique({ where: { id: segmentId } });
    if (current) {
      await prisma.draftSegment.update({
        where: { id: conflict.id },
        data: { segmentOrder: current.segmentOrder },
      });
    }
  }
  await prisma.draftSegment.update({
    where: { id: segmentId },
    data: { segmentOrder: order, pickCountPerPlayer: Math.max(0, picks) },
  });
  revalidatePath(`/admin/leagues/${leagueId}/draft-setup`);
}

export async function updateScoringAction(
  leagueId: string,
  category: Category,
  formData: FormData,
) {
  await requireAdmin();
  const cfg = await prisma.scoringConfig.findUnique({
    where: { leagueId_category: { leagueId, category } },
  });
  if (!cfg || cfg.locked) return;
  const parsed = JSON.parse(cfg.configJson);
  const multipliers: Record<string, number> = { ...(parsed.multipliers ?? {}) };
  for (const key of Object.keys(multipliers)) {
    const v = formData.get(`m_${key}`);
    if (v !== null && String(v) !== "") {
      const num = Number(v);
      if (Number.isFinite(num)) multipliers[key] = num;
    }
  }
  parsed.multipliers = multipliers;
  await prisma.scoringConfig.update({
    where: { id: cfg.id },
    data: { configJson: JSON.stringify(parsed) },
  });
  revalidatePath(`/admin/leagues/${leagueId}/draft-setup`);
}

export async function updateLeagueSettingsAction(leagueId: string, formData: FormData) {
  await requireAdmin();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return;
  const draftStarted = league.status === "drafting" || league.status === "drafted";
  const settings = readLeagueSettings(league);

  if (!draftStarted) {
    const exclusivity = String(formData.get("exclusivity") ?? settings.exclusivity);
    if (exclusivity === "global_across_all_categories" || exclusivity === "exclusive_within_category_only") {
      settings.exclusivity = exclusivity;
    }
    const cinderellaType = String(formData.get("cinderellaEligibilityType") ?? settings.cinderellaEligibility.type);
    if (cinderellaType === "outside_top_25" || cinderellaType === "min_preseason_rank") {
      settings.cinderellaEligibility.type = cinderellaType;
    }
    const minRank = Number(formData.get("cinderellaMinRank") ?? settings.cinderellaEligibility.minPreseasonRank);
    if (Number.isInteger(minRank) && minRank > 0) settings.cinderellaEligibility.minPreseasonRank = minRank;
    const confs = String(formData.get("conferences") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (confs.length > 0) settings.conferences = confs;
    const timer = Number(formData.get("draftTimerSeconds") ?? settings.draftTimerSeconds);
    if (Number.isInteger(timer) && timer >= 0) settings.draftTimerSeconds = timer;
  }
  // Always-editable settings
  settings.trashTalkEnabled = formData.get("trashTalkEnabled") === "on";
  settings.trashTalkAllowSelfDelete = formData.get("trashTalkAllowSelfDelete") === "on";
  settings.publishProvisionalStandings = formData.get("publishProvisionalStandings") === "on";

  const merged = { ...JSON.parse(league.settingsJson || "{}"), ...settings };
  await prisma.league.update({
    where: { id: leagueId },
    data: { settingsJson: writeLeagueSettings(merged) },
  });
  revalidatePath(`/admin/leagues/${leagueId}/draft-setup`);
}
