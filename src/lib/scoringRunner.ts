// Glue between DB and the pure scoring engine.
// Aggregates published-or-applied result imports per category and computes Score rows.

import { prisma } from "./prisma";
import { CATEGORIES, Category, ScoringConfigShape } from "./categories";
import { scoreCategory, DraftedPick, ResultEntry } from "./scoring";
import { normalizeName } from "./normalize";

export type CategoryResultsInput = {
  category: Category;
  results: ResultEntry[];
  cfg: ScoringConfigShape;
};

export async function loadDraftedPicksByCategory(leagueId: string, category: Category) {
  const picks = await prisma.draftPick.findMany({
    where: { leagueId, category },
    include: { draftableEntity: true },
  });
  const out: DraftedPick[] = picks.map((p) => ({
    pickId: p.id,
    playerUserId: p.playerUserId,
    category,
    schoolName: p.draftableEntity.schoolName,
    athleteName: p.draftableEntity.athleteName,
    conference: p.draftableEntity.conference,
    lockedOdds: p.lockedOdds,
  }));
  return out;
}

export async function loadAppliedResults(leagueId: string, category: Category): Promise<ResultEntry[]> {
  const resultType = categoryToResultType(category);
  const imports = await prisma.resultImport.findMany({
    where: { leagueId, resultType, status: "applied" },
    include: { rows: { include: { matchedEntity: true } } },
  });
  const rows: ResultEntry[] = [];
  for (const imp of imports) {
    for (const r of imp.rows) {
      if (r.matchStatus === "ignored") continue;
      const raw = JSON.parse(r.rawRowJson || "{}");
      const norm = JSON.parse(r.normalizedValuesJson || "{}");
      const entry: ResultEntry = {
        schoolName: r.matchedEntity?.schoolName ?? raw.school_name ?? raw.school ?? "",
        athleteName: r.matchedEntity?.athleteName ?? raw.athlete_name ?? raw.athlete ?? null,
        outcome: r.outcome ?? norm.outcome ?? "",
        finalApRank: norm.finalApRank ?? null,
        conference: r.matchedEntity?.conference ?? raw.conference ?? null,
      };
      rows.push(entry);
    }
  }
  return rows;
}

function categoryToResultType(category: Category): string {
  if (category === "conference_champion") return "conference";
  return category;
}

export async function loadScoringConfig(
  leagueId: string,
  category: Category,
): Promise<ScoringConfigShape | null> {
  const cfg = await prisma.scoringConfig.findUnique({
    where: { leagueId_category: { leagueId, category } },
  });
  if (!cfg) return null;
  return JSON.parse(cfg.configJson) as ScoringConfigShape;
}

export async function recalculateAllScores(leagueId: string) {
  // Wipe and recompute all scores. Marks them unpublished by default.
  await prisma.score.deleteMany({ where: { leagueId } });
  const summary: Record<Category, number> = {
    heisman: 0,
    cfp: 0,
    cinderella: 0,
    conference_champion: 0,
  };
  for (const category of CATEGORIES) {
    const cfg = await loadScoringConfig(leagueId, category);
    if (!cfg) continue;
    const drafted = await loadDraftedPicksByCategory(leagueId, category);
    if (drafted.length === 0) continue;
    const results = await loadAppliedResults(leagueId, category);
    if (results.length === 0) continue;
    const scored = scoreCategory(category, drafted, results, cfg);
    for (const s of scored) {
      // Embed final AP rank into calculation for tiebreaker on standings page
      if (category === "cinderella") {
        const matched = results.find(
          (r) => normalizeName(r.schoolName) === normalizeName(drafted.find((d) => d.pickId === s.pickId)?.schoolName ?? ""),
        );
        if (matched) {
          (s.calculation as Record<string, unknown>).finalApRank = matched.finalApRank ?? null;
        }
      }
      await prisma.score.create({
        data: {
          leagueId,
          draftPickId: s.pickId,
          category: s.category,
          outcome: s.outcome,
          points: s.points,
          calculationJson: JSON.stringify(s.calculation),
          published: false,
        },
      });
      summary[category] += 1;
    }
  }
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "scoring" },
  });
  return summary;
}

export async function publishStandings(leagueId: string) {
  await prisma.score.updateMany({
    where: { leagueId },
    data: { published: true },
  });
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "completed" },
  });
}
