import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireLeagueMember } from "@/lib/auth";
import { DraftRoom } from "@/components/DraftRoom";
import { getPlan } from "@/lib/draftEngine";
import { readLeagueSettings } from "@/lib/leagueSettings";

export default async function DraftRoomPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const { user } = await requireLeagueMember(leagueId);
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      draftState: true,
      members: { include: { user: true }, orderBy: { draftPosition: "asc" } },
      draftSegments: { orderBy: { segmentOrder: "asc" } },
    },
  });
  if (!league) notFound();
  const settings = readLeagueSettings(league);

  const entities = await prisma.draftableEntity.findMany({
    where: { leagueId, locked: true },
    orderBy: [{ schoolName: "asc" }],
  });
  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    include: { player: true, draftableEntity: true },
    orderBy: { overallPickNumber: "asc" },
  });
  const plan = await getPlan(leagueId);

  return (
    <DraftRoom
      currentUser={{ id: user.id, displayName: user.displayName, role: user.role }}
      league={{
        id: league.id,
        name: league.name,
        status: league.status,
        exclusivity: settings.exclusivity,
      }}
      members={league.members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        draftPosition: m.draftPosition ?? 0,
      }))}
      segments={league.draftSegments.map((s) => ({
        id: s.id,
        category: s.category,
        segmentOrder: s.segmentOrder,
        pickCountPerPlayer: s.pickCountPerPlayer,
        status: s.status,
      }))}
      state={
        league.draftState
          ? {
              status: league.draftState.status,
              paused: league.draftState.paused,
              currentSegmentId: league.draftState.currentSegmentId,
              currentOverallPickNumber: league.draftState.currentOverallPickNumber,
              currentPlayerUserId: league.draftState.currentPlayerUserId,
              tick: league.draftState.tick,
            }
          : null
      }
      entities={entities.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        athleteName: e.athleteName,
        schoolName: e.schoolName,
        conference: e.conference,
        position: e.position,
        preseasonRank: e.preseasonRank,
        oddsAmerican: e.oddsAmerican,
        eligibleCategories: JSON.parse(e.eligibleCategoriesJson),
      }))}
      picks={picks.map((p) => ({
        id: p.id,
        overallPickNumber: p.overallPickNumber,
        roundNumber: p.roundNumber,
        category: p.category,
        playerUserId: p.playerUserId,
        playerName: p.player.displayName,
        entityId: p.draftableEntityId,
        entityLabel: p.draftableEntity.athleteName
          ? `${p.draftableEntity.athleteName} (${p.draftableEntity.schoolName})`
          : p.draftableEntity.schoolName,
        conference: p.draftableEntity.conference,
        lockedOdds: p.lockedOdds,
        adminOverride: p.adminOverride,
      }))}
      plan={plan.map((p) => ({
        overallPickNumber: p.overallPickNumber,
        category: p.category,
        playerUserId: p.playerUserId,
      }))}
    />
  );
}
