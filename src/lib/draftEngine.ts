// Server-side draft state engine. Handles starting, advancing, undoing picks.
// Uses a precomputed snake order (planned_pick_table) derived on demand.

import { prisma } from "./prisma";
import { buildSnakeOrder, totalPicksFor } from "./draft";
import { publish, leagueChannel } from "./events";
import { readLeagueSettings } from "./leagueSettings";
import type { Category } from "./categories";

export type PlannedPick = {
  overallPickNumber: number;
  segmentId: string;
  category: string;
  roundNumberInSegment: number;
  playerSlot: number;
  playerUserId: string | null; // null if no member at that slot yet
};

export async function getPlan(leagueId: string): Promise<PlannedPick[]> {
  const [segments, members] = await Promise.all([
    prisma.draftSegment.findMany({ where: { leagueId }, orderBy: { segmentOrder: "asc" } }),
    prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: { draftPosition: "asc" },
    }),
  ]);
  const slotToUser = new Map<number, string>();
  members.forEach((m, idx) => {
    const slot = m.draftPosition ?? idx + 1;
    slotToUser.set(slot, m.userId);
  });
  const playerCount = members.length;
  const order = buildSnakeOrder(segments, playerCount);
  return order.map((p) => ({
    ...p,
    playerUserId: slotToUser.get(p.playerSlot) ?? null,
  }));
}

export async function startDraft(leagueId: string, actorUserId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("League not found");
  const members = await prisma.leagueMember.findMany({ where: { leagueId } });
  if (members.length < 2) throw new Error("Need at least 2 players to start the draft.");
  const entityCount = await prisma.draftableEntity.count({
    where: { leagueId, locked: true },
  });
  if (entityCount === 0) throw new Error("Lock the draft pool before starting the draft.");

  const plan = await getPlan(leagueId);
  if (plan.length === 0) throw new Error("Draft plan is empty.");
  const first = plan[0];
  if (!first.playerUserId) throw new Error("Draft order is not fully assigned.");

  await prisma.draftState.upsert({
    where: { leagueId },
    update: {
      status: "active",
      paused: false,
      currentSegmentId: first.segmentId,
      currentOverallPickNumber: 1,
      currentPlayerUserId: first.playerUserId,
      tick: { increment: 1 },
    },
    create: {
      leagueId,
      status: "active",
      paused: false,
      currentSegmentId: first.segmentId,
      currentOverallPickNumber: 1,
      currentPlayerUserId: first.playerUserId,
      tick: 1,
    },
  });
  await prisma.draftSegment.updateMany({
    where: { leagueId },
    data: { status: "pending" },
  });
  await prisma.draftSegment.update({
    where: { id: first.segmentId },
    data: { status: "active" },
  });
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "drafting" },
  });
  await prisma.auditLog.create({
    data: { leagueId, actorUserId, action: "draft.start" },
  });
  publish(leagueChannel(leagueId), { type: "draft.start" });
}

export async function pauseDraft(leagueId: string, actorUserId: string, paused: boolean) {
  await prisma.draftState.update({
    where: { leagueId },
    data: { paused, status: paused ? "paused" : "active", tick: { increment: 1 } },
  });
  await prisma.auditLog.create({
    data: { leagueId, actorUserId, action: paused ? "draft.pause" : "draft.resume" },
  });
  publish(leagueChannel(leagueId), { type: paused ? "draft.pause" : "draft.resume" });
}

export async function submitPick(
  leagueId: string,
  actorUserId: string,
  draftableEntityId: string,
  options: { adminOverride?: boolean; overrideReason?: string } = {},
) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("League not found");
  const settings = readLeagueSettings(league);
  const state = await prisma.draftState.findUnique({ where: { leagueId } });
  if (!state) throw new Error("No draft state.");
  if (state.status !== "active") throw new Error("Draft is not active.");
  if (state.paused) throw new Error("Draft is paused.");
  if (!state.currentPlayerUserId || !state.currentSegmentId) throw new Error("Draft state inconsistent.");

  const plan = await getPlan(leagueId);
  const planned = plan.find((p) => p.overallPickNumber === state.currentOverallPickNumber);
  if (!planned) throw new Error("Planned pick not found.");

  if (!options.adminOverride) {
    if (actorUserId !== state.currentPlayerUserId) throw new Error("It is not your pick.");
  }
  // Validate entity
  const entity = await prisma.draftableEntity.findUnique({ where: { id: draftableEntityId } });
  if (!entity || entity.leagueId !== leagueId) throw new Error("Entity not in league.");
  const cats: string[] = JSON.parse(entity.eligibleCategoriesJson);
  if (!cats.includes(planned.category)) {
    throw new Error(`Pick is not eligible for ${planned.category}.`);
  }

  // Enforce exclusivity
  if (settings.exclusivity === "global_across_all_categories") {
    const exists = await prisma.draftPick.findFirst({
      where: { leagueId, draftableEntityId },
    });
    if (exists) throw new Error("Already drafted in this league.");
  } else {
    const exists = await prisma.draftPick.findFirst({
      where: { leagueId, draftableEntityId, category: planned.category },
    });
    if (exists) throw new Error(`Already drafted in ${planned.category}.`);
  }

  // Compute round number in segment + record pick
  const pickPlayerUserId = options.adminOverride
    ? state.currentPlayerUserId
    : actorUserId;

  const newPick = await prisma.draftPick.create({
    data: {
      leagueId,
      draftSegmentId: planned.segmentId,
      roundNumber: planned.roundNumberInSegment,
      overallPickNumber: planned.overallPickNumber,
      playerUserId: pickPlayerUserId,
      draftableEntityId,
      category: planned.category,
      lockedOdds: entity.oddsAmerican,
      adminOverride: !!options.adminOverride,
      overrideReason: options.overrideReason ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId,
      action: options.adminOverride ? "draft.override_pick" : "draft.submit_pick",
      entityType: "DraftPick",
      entityId: newPick.id,
      afterJson: JSON.stringify({
        overall: planned.overallPickNumber,
        category: planned.category,
        entityId: entity.id,
        oddsLocked: entity.oddsAmerican,
        reason: options.overrideReason ?? null,
      }),
    },
  });

  // Advance state
  await advanceToNextPick(leagueId);
  publish(leagueChannel(leagueId), { type: "draft.pick", overall: planned.overallPickNumber });
}

export async function advanceToNextPick(leagueId: string) {
  const plan = await getPlan(leagueId);
  const totalPicks = plan.length;
  const made = await prisma.draftPick.count({ where: { leagueId } });
  if (made >= totalPicks) {
    // Draft complete
    await prisma.draftState.update({
      where: { leagueId },
      data: {
        status: "complete",
        currentSegmentId: null,
        currentPlayerUserId: null,
        currentOverallPickNumber: totalPicks,
        tick: { increment: 1 },
      },
    });
    await prisma.draftSegment.updateMany({
      where: { leagueId },
      data: { status: "complete" },
    });
    await prisma.league.update({
      where: { id: leagueId },
      data: { status: "drafted" },
    });
    publish(leagueChannel(leagueId), { type: "draft.complete" });
    return;
  }
  const next = plan[made]; // next is at index = picks made
  const prevState = await prisma.draftState.findUnique({ where: { leagueId } });
  await prisma.draftState.update({
    where: { leagueId },
    data: {
      currentSegmentId: next.segmentId,
      currentOverallPickNumber: next.overallPickNumber,
      currentPlayerUserId: next.playerUserId,
      tick: { increment: 1 },
    },
  });
  // Update segment statuses
  if (prevState?.currentSegmentId && prevState.currentSegmentId !== next.segmentId) {
    await prisma.draftSegment.update({
      where: { id: prevState.currentSegmentId },
      data: { status: "complete" },
    });
    await prisma.draftSegment.update({
      where: { id: next.segmentId },
      data: { status: "active" },
    });
  } else if (prevState && !prevState.currentSegmentId) {
    await prisma.draftSegment.update({
      where: { id: next.segmentId },
      data: { status: "active" },
    });
  }
}

export async function undoLastPick(leagueId: string, actorUserId: string) {
  const last = await prisma.draftPick.findFirst({
    where: { leagueId },
    orderBy: { overallPickNumber: "desc" },
  });
  if (!last) return;
  await prisma.draftPick.delete({ where: { id: last.id } });
  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId,
      action: "draft.undo_pick",
      entityType: "DraftPick",
      entityId: last.id,
      beforeJson: JSON.stringify({
        overall: last.overallPickNumber,
        entityId: last.draftableEntityId,
        playerUserId: last.playerUserId,
      }),
    },
  });
  // Re-derive state
  const plan = await getPlan(leagueId);
  const made = await prisma.draftPick.count({ where: { leagueId } });
  const next = plan[made];
  await prisma.draftState.update({
    where: { leagueId },
    data: {
      status: "active",
      paused: false,
      currentSegmentId: next?.segmentId ?? null,
      currentOverallPickNumber: next?.overallPickNumber ?? 0,
      currentPlayerUserId: next?.playerUserId ?? null,
      tick: { increment: 1 },
    },
  });
  // Reset segment statuses
  await prisma.draftSegment.updateMany({
    where: { leagueId },
    data: { status: "pending" },
  });
  if (next?.segmentId) {
    await prisma.draftSegment.update({
      where: { id: next.segmentId },
      data: { status: "active" },
    });
  }
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "drafting" },
  });
  publish(leagueChannel(leagueId), { type: "draft.undo", overall: last.overallPickNumber });
}

export async function resetDraft(leagueId: string, actorUserId: string) {
  const made = await prisma.draftPick.count({ where: { leagueId } });
  if (made > 0) throw new Error("Reset only allowed before any picks have been made.");
  await prisma.draftState.update({
    where: { leagueId },
    data: {
      status: "not_started",
      currentSegmentId: null,
      currentOverallPickNumber: 0,
      currentPlayerUserId: null,
      paused: false,
      tick: { increment: 1 },
    },
  });
  await prisma.draftSegment.updateMany({ where: { leagueId }, data: { status: "pending" } });
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "draft_ready" },
  });
  await prisma.auditLog.create({
    data: { leagueId, actorUserId, action: "draft.reset" },
  });
  publish(leagueChannel(leagueId), { type: "draft.reset" });
}

export async function totalPlannedPicks(leagueId: string): Promise<number> {
  const segments = await prisma.draftSegment.findMany({ where: { leagueId } });
  const memberCount = await prisma.leagueMember.count({ where: { leagueId } });
  return totalPicksFor(segments, memberCount);
}
