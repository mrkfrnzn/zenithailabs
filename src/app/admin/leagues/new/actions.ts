"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { defaultLeagueSettings, DEFAULT_SCORING, DEFAULT_SEGMENT_ORDER, DEFAULT_PICK_COUNTS } from "@/lib/categories";

const Schema = z.object({
  name: z.string().min(1).max(120),
  seasonYear: z.coerce.number().int().min(2000).max(2100),
  maxPlayers: z.coerce.number().int().min(2).max(20),
});

export async function createLeagueAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = Schema.parse({
    name: formData.get("name"),
    seasonYear: formData.get("seasonYear"),
    maxPlayers: formData.get("maxPlayers"),
  });

  const settings = defaultLeagueSettings();
  // Note maxPlayers is stored in settings json since the schema uses settingsJson.
  const settingsJson = JSON.stringify({ ...settings, maxPlayers: parsed.maxPlayers });

  const league = await prisma.league.create({
    data: {
      name: parsed.name,
      seasonYear: parsed.seasonYear,
      createdById: admin.id,
      settingsJson,
    },
  });

  // Create default scoring configs
  for (const [category, cfg] of Object.entries(DEFAULT_SCORING)) {
    await prisma.scoringConfig.create({
      data: { leagueId: league.id, category, configJson: JSON.stringify(cfg) },
    });
  }

  // Create default segments
  for (let i = 0; i < DEFAULT_SEGMENT_ORDER.length; i++) {
    const cat = DEFAULT_SEGMENT_ORDER[i];
    await prisma.draftSegment.create({
      data: {
        leagueId: league.id,
        category: cat,
        segmentOrder: i + 1,
        pickCountPerPlayer: DEFAULT_PICK_COUNTS[cat],
      },
    });
  }

  // Initialize draft state
  await prisma.draftState.create({
    data: { leagueId: league.id, status: "not_started" },
  });

  await prisma.auditLog.create({
    data: {
      leagueId: league.id,
      actorUserId: admin.id,
      action: "league.create",
      entityType: "League",
      entityId: league.id,
      afterJson: JSON.stringify({ name: league.name, seasonYear: league.seasonYear }),
    },
  });

  redirect(`/admin/leagues/${league.id}`);
}
