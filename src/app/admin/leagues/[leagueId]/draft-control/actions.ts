"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  startDraft,
  pauseDraft,
  submitPick,
  undoLastPick,
  resetDraft,
} from "@/lib/draftEngine";

function err(leagueId: string, message: string) {
  redirect(`/admin/leagues/${leagueId}/draft-control?err=${encodeURIComponent(message)}`);
}

export async function startDraftAction(leagueId: string) {
  const admin = await requireAdmin();
  try {
    await startDraft(leagueId, admin.id);
  } catch (e) {
    err(leagueId, e instanceof Error ? e.message : "Could not start draft.");
  }
  revalidatePath(`/admin/leagues/${leagueId}/draft-control`);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function pauseDraftAction(leagueId: string) {
  const admin = await requireAdmin();
  await pauseDraft(leagueId, admin.id, true);
  revalidatePath(`/admin/leagues/${leagueId}/draft-control`);
}

export async function resumeDraftAction(leagueId: string) {
  const admin = await requireAdmin();
  await pauseDraft(leagueId, admin.id, false);
  revalidatePath(`/admin/leagues/${leagueId}/draft-control`);
}

export async function undoLastPickAction(leagueId: string) {
  const admin = await requireAdmin();
  await undoLastPick(leagueId, admin.id);
  revalidatePath(`/admin/leagues/${leagueId}/draft-control`);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function resetDraftAction(leagueId: string) {
  const admin = await requireAdmin();
  try {
    await resetDraft(leagueId, admin.id);
  } catch (e) {
    err(leagueId, e instanceof Error ? e.message : "Reset failed.");
  }
  revalidatePath(`/admin/leagues/${leagueId}/draft-control`);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function adminOverrideAction(leagueId: string, formData: FormData) {
  const admin = await requireAdmin();
  const draftableEntityId = String(formData.get("draftableEntityId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!draftableEntityId || !reason) {
    err(leagueId, "Entity and reason are required for override.");
  }
  try {
    await submitPick(leagueId, admin.id, draftableEntityId, {
      adminOverride: true,
      overrideReason: reason,
    });
  } catch (e) {
    err(leagueId, e instanceof Error ? e.message : "Override failed.");
  }
  revalidatePath(`/admin/leagues/${leagueId}/draft-control`);
  revalidatePath(`/leagues/${leagueId}/draft`);
}
