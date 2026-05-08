"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

const AddPlayerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(60),
  password: z.string().min(6).max(120).optional().or(z.literal("")),
});

export async function addPlayerAction(leagueId: string, formData: FormData) {
  const admin = await requireAdmin();
  const parsed = AddPlayerSchema.parse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    displayName: String(formData.get("displayName") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (!user) {
    const tempPassword = parsed.password && parsed.password.length >= 6
      ? parsed.password
      : Math.random().toString(36).slice(2, 10) + "Aa1!";
    user = await prisma.user.create({
      data: {
        email: parsed.email,
        displayName: parsed.displayName,
        passwordHash: await hashPassword(tempPassword),
        role: "player",
      },
    });
  }

  const existing = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (existing) {
    revalidatePath(`/admin/leagues/${leagueId}`);
    return;
  }
  const memberCount = await prisma.leagueMember.count({ where: { leagueId } });
  await prisma.leagueMember.create({
    data: {
      leagueId,
      userId: user.id,
      displayName: parsed.displayName,
      draftPosition: memberCount + 1,
    },
  });
  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "league.add_player",
      entityType: "User",
      entityId: user.id,
      afterJson: JSON.stringify({ email: user.email, displayName: parsed.displayName }),
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function removePlayerAction(leagueId: string, memberId: string) {
  const admin = await requireAdmin();
  const member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!member || member.leagueId !== leagueId) return;
  // Don't allow removing if draft has begun
  const state = await prisma.draftState.findUnique({ where: { leagueId } });
  if (state && state.status !== "not_started") return;
  await prisma.leagueMember.delete({ where: { id: memberId } });
  // Re-sequence draft positions
  const remaining = await prisma.leagueMember.findMany({
    where: { leagueId },
    orderBy: { draftPosition: "asc" },
  });
  await Promise.all(
    remaining.map((m, idx) =>
      prisma.leagueMember.update({ where: { id: m.id }, data: { draftPosition: idx + 1 } }),
    ),
  );
  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "league.remove_player",
      entityType: "LeagueMember",
      entityId: memberId,
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function randomizeOrderAction(leagueId: string) {
  const admin = await requireAdmin();
  const state = await prisma.draftState.findUnique({ where: { leagueId } });
  if (state && state.status !== "not_started") return;
  const members = await prisma.leagueMember.findMany({ where: { leagueId } });
  const shuffled = [...members].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i++) {
    await prisma.leagueMember.update({
      where: { id: shuffled[i].id },
      data: { draftPosition: i + 1 },
    });
  }
  await prisma.auditLog.create({
    data: {
      leagueId,
      actorUserId: admin.id,
      action: "league.randomize_order",
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function setDraftPositionAction(
  leagueId: string,
  memberId: string,
  formData: FormData,
) {
  await requireAdmin();
  const state = await prisma.draftState.findUnique({ where: { leagueId } });
  if (state && state.status !== "not_started") return;
  const target = Number(formData.get("draftPosition") ?? 0);
  if (!Number.isInteger(target) || target < 1) return;
  const target_member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!target_member || target_member.leagueId !== leagueId) return;
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    orderBy: { draftPosition: "asc" },
  });
  const filtered = members.filter((m) => m.id !== memberId);
  const insertIndex = Math.min(Math.max(target - 1, 0), filtered.length);
  filtered.splice(insertIndex, 0, target_member);
  for (let i = 0; i < filtered.length; i++) {
    await prisma.leagueMember.update({
      where: { id: filtered[i].id },
      data: { draftPosition: i + 1 },
    });
  }
  revalidatePath(`/admin/leagues/${leagueId}`);
}
