// CFB War Chest scoring engine.
// Pure functions - keep deterministic and testable. No DB calls here.

import type { Category, ScoringConfigShape } from "./categories";

export type DraftedPick = {
  pickId: string;
  playerUserId: string;
  category: Category;
  schoolName: string;
  athleteName: string | null;
  conference: string | null;
  lockedOdds: number; // American odds, integer
};

export type ResultEntry = {
  // Identifies the result
  schoolName: string;
  athleteName: string | null;
  outcome: string; // category-specific outcome key
  finalApRank?: number | null;
  conference?: string | null;
};

export type ScoredPick = {
  pickId: string;
  playerUserId: string;
  category: Category;
  outcome: string;
  points: number;
  calculation: ScoringCalculation;
};

export type ScoringCalculation = {
  formula: string;
  outcome: string;
  multiplier?: number;
  fixedPoints?: number;
  entityOdds?: number;
  lowestDraftedOdds?: number;
  oddsRatio?: number;
  conferenceGroup?: string | null;
  notes?: string;
};

// Helper: outcome match keys
function matchKey(s?: string | null): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

// Find lowest drafted American odds within a set of picks.
// "Lowest" here follows the spec convention used in the rules:
// favored picks (smaller positive odds, e.g. +400) divide larger underdog odds (e.g. +2000).
// We use the smallest absolute integer value across the drafted set.
export function lowestDraftedOdds(picks: DraftedPick[]): number {
  if (picks.length === 0) return 1;
  return Math.min(...picks.map((p) => Math.abs(p.lockedOdds)));
}

export function scoreHeisman(
  drafted: DraftedPick[],
  results: ResultEntry[],
  cfg: ScoringConfigShape,
): ScoredPick[] {
  const lowest = lowestDraftedOdds(drafted);
  const winners = new Set(
    results
      .filter((r) => matchKey(r.outcome) === "winner")
      .map((r) => normalize(r.athleteName ?? r.schoolName)),
  );
  const finalists = new Set(
    results
      .filter((r) => matchKey(r.outcome) === "finalist_non_winner")
      .map((r) => normalize(r.athleteName ?? r.schoolName)),
  );

  return drafted.map<ScoredPick>((pick) => {
    const key = normalize(pick.athleteName ?? pick.schoolName);
    let outcome = "no_score";
    if (winners.has(key)) outcome = "winner";
    else if (finalists.has(key)) outcome = "finalist_non_winner";

    const multiplier = cfg.multipliers[outcome] ?? 0;
    const ratio = pick.lockedOdds / lowest;
    const points = outcome === "no_score" ? 0 : Math.round(multiplier * ratio * 100) / 100;
    return {
      pickId: pick.pickId,
      playerUserId: pick.playerUserId,
      category: "heisman",
      outcome,
      points,
      calculation: {
        formula: cfg.formula,
        outcome,
        multiplier,
        entityOdds: pick.lockedOdds,
        lowestDraftedOdds: lowest,
        oddsRatio: ratio,
        notes: cfg.notes,
      },
    };
  });
}

export function scoreCfp(
  drafted: DraftedPick[],
  results: ResultEntry[],
  cfg: ScoringConfigShape,
): ScoredPick[] {
  const lowest = lowestDraftedOdds(drafted);
  const byTeam = new Map<string, string>();
  for (const r of results) byTeam.set(normalize(r.schoolName), matchKey(r.outcome));

  return drafted.map<ScoredPick>((pick) => {
    const outcome = byTeam.get(normalize(pick.schoolName)) ?? "misses_playoff";
    const multiplier = cfg.multipliers[outcome] ?? 0;
    const ratio = pick.lockedOdds / lowest;
    const points = multiplier === 0 ? 0 : Math.round(multiplier * ratio * 100) / 100;
    return {
      pickId: pick.pickId,
      playerUserId: pick.playerUserId,
      category: "cfp",
      outcome,
      points,
      calculation: {
        formula: cfg.formula,
        outcome,
        multiplier,
        entityOdds: pick.lockedOdds,
        lowestDraftedOdds: lowest,
        oddsRatio: ratio,
        notes: cfg.notes,
      },
    };
  });
}

export function scoreCinderella(
  drafted: DraftedPick[],
  results: ResultEntry[],
  cfg: ScoringConfigShape,
): ScoredPick[] {
  const byTeam = new Map<string, number | null>();
  for (const r of results) {
    byTeam.set(normalize(r.schoolName), r.finalApRank ?? null);
  }

  return drafted.map<ScoredPick>((pick) => {
    const rank = byTeam.get(normalize(pick.schoolName)) ?? null;
    const outcome = rankBucket(rank);
    const points = cfg.multipliers[outcome] ?? 0;
    return {
      pickId: pick.pickId,
      playerUserId: pick.playerUserId,
      category: "cinderella",
      outcome,
      points,
      calculation: {
        formula: cfg.formula,
        outcome,
        fixedPoints: points,
        notes: cfg.notes,
      },
    };
  });
}

function rankBucket(rank: number | null): string {
  if (rank === null || rank === undefined) return "unranked";
  if (rank <= 0) return "unranked";
  if (rank <= 10) return "final_ap_top_10";
  if (rank <= 20) return "final_ap_11_to_20";
  if (rank <= 25) return "final_ap_21_to_25";
  return "unranked";
}

export function scoreConferenceChampion(
  drafted: DraftedPick[],
  results: ResultEntry[],
  cfg: ScoringConfigShape,
): ScoredPick[] {
  // Group lowest odds per conference.
  const lowestByConf = new Map<string, number>();
  for (const p of drafted) {
    const conf = p.conference ?? "UNKNOWN";
    const cur = lowestByConf.get(conf);
    if (cur === undefined || Math.abs(p.lockedOdds) < cur) {
      lowestByConf.set(conf, Math.abs(p.lockedOdds));
    }
  }
  const byTeam = new Map<string, string>();
  for (const r of results) byTeam.set(normalize(r.schoolName), matchKey(r.outcome));

  return drafted.map<ScoredPick>((pick) => {
    const conf = pick.conference ?? "UNKNOWN";
    const lowest = lowestByConf.get(conf) ?? 1;
    const outcome = byTeam.get(normalize(pick.schoolName)) ?? "fails_to_qualify";
    const multiplier = cfg.multipliers[outcome] ?? 0;
    const ratio = pick.lockedOdds / lowest;
    const points = multiplier === 0 ? 0 : Math.round(multiplier * ratio * 100) / 100;
    return {
      pickId: pick.pickId,
      playerUserId: pick.playerUserId,
      category: "conference_champion",
      outcome,
      points,
      calculation: {
        formula: cfg.formula,
        outcome,
        multiplier,
        entityOdds: pick.lockedOdds,
        lowestDraftedOdds: lowest,
        oddsRatio: ratio,
        conferenceGroup: conf,
        notes: cfg.notes,
      },
    };
  });
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreCategory(
  category: Category,
  drafted: DraftedPick[],
  results: ResultEntry[],
  cfg: ScoringConfigShape,
): ScoredPick[] {
  switch (category) {
    case "heisman":
      return scoreHeisman(drafted, results, cfg);
    case "cfp":
      return scoreCfp(drafted, results, cfg);
    case "cinderella":
      return scoreCinderella(drafted, results, cfg);
    case "conference_champion":
      return scoreConferenceChampion(drafted, results, cfg);
  }
}
