import { describe, it, expect } from "vitest";
import {
  scoreHeisman,
  scoreCfp,
  scoreCinderella,
  scoreConferenceChampion,
  lowestDraftedOdds,
  type DraftedPick,
  type ResultEntry,
} from "../scoring";
import { DEFAULT_SCORING } from "../categories";

const heismanCfg = DEFAULT_SCORING.heisman;
const cfpCfg = DEFAULT_SCORING.cfp;
const cinderellaCfg = DEFAULT_SCORING.cinderella;
const confCfg = DEFAULT_SCORING.conference_champion;

describe("lowestDraftedOdds", () => {
  it("returns 1 for empty input (safe divisor)", () => {
    expect(lowestDraftedOdds([])).toBe(1);
  });
  it("finds minimum absolute value", () => {
    const picks: DraftedPick[] = [
      makePick({ id: "a", odds: 800 }),
      makePick({ id: "b", odds: 1200 }),
      makePick({ id: "c", odds: 350 }),
    ];
    expect(lowestDraftedOdds(picks)).toBe(350);
  });
  it("treats negative odds by absolute value", () => {
    const picks: DraftedPick[] = [
      makePick({ id: "a", odds: -120 }),
      makePick({ id: "b", odds: 600 }),
    ];
    expect(lowestDraftedOdds(picks)).toBe(120);
  });
});

describe("scoreHeisman", () => {
  it("awards winner multiplier scaled by odds ratio", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "p1", category: "heisman", athlete: "Quinn Stryker", school: "Georgia", odds: 700 }),
      makePick({ id: "p2", category: "heisman", athlete: "Ronan Vega", school: "Oregon", odds: 1200 }),
    ];
    const results: ResultEntry[] = [
      { schoolName: "Oregon", athleteName: "Ronan Vega", outcome: "winner" },
    ];
    const out = scoreHeisman(drafted, results, heismanCfg);
    const winner = out.find((s) => s.pickId === "p2")!;
    // multiplier 350 × (1200 / 700) = 600
    expect(winner.outcome).toBe("winner");
    expect(winner.points).toBeCloseTo(600, 0);
    const other = out.find((s) => s.pickId === "p1")!;
    expect(other.outcome).toBe("no_score");
    expect(other.points).toBe(0);
  });

  it("awards finalist multiplier", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "p1", category: "heisman", athlete: "Quinn Stryker", school: "Georgia", odds: 700 }),
    ];
    const results: ResultEntry[] = [
      { schoolName: "Georgia", athleteName: "Quinn Stryker", outcome: "finalist_non_winner" },
    ];
    const out = scoreHeisman(drafted, results, heismanCfg);
    expect(out[0].outcome).toBe("finalist_non_winner");
    // 100 × (700/700) = 100
    expect(out[0].points).toBe(100);
  });

  it("normalizes names with punctuation/case differences", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "p1", category: "heisman", athlete: "Marcus O'Neal Jr.", school: "Texas", odds: 800 }),
    ];
    const results: ResultEntry[] = [
      { schoolName: "Texas", athleteName: "  marcus oneal jr ", outcome: "winner" },
    ];
    const out = scoreHeisman(drafted, results, heismanCfg);
    expect(out[0].outcome).toBe("winner");
  });
});

describe("scoreCfp", () => {
  it("awards points by outcome with odds ratio", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "g", category: "cfp", school: "Georgia", odds: 450 }),
      makePick({ id: "t", category: "cfp", school: "Texas", odds: 650 }),
      makePick({ id: "o", category: "cfp", school: "Oregon", odds: 750 }),
    ];
    const results: ResultEntry[] = [
      { schoolName: "Texas", athleteName: null, outcome: "wins_national_title" },
      { schoolName: "Georgia", athleteName: null, outcome: "loses_semifinal" },
      { schoolName: "Oregon", athleteName: null, outcome: "misses_playoff" },
    ];
    const out = scoreCfp(drafted, results, cfpCfg);
    const winner = out.find((s) => s.pickId === "t")!;
    // 300 × (650/450)
    expect(winner.outcome).toBe("wins_national_title");
    expect(winner.points).toBeCloseTo(300 * (650 / 450), 1);
    const semi = out.find((s) => s.pickId === "g")!;
    expect(semi.outcome).toBe("loses_semifinal");
    expect(semi.points).toBeCloseTo(100 * (450 / 450), 1);
    const miss = out.find((s) => s.pickId === "o")!;
    expect(miss.outcome).toBe("misses_playoff");
    expect(miss.points).toBe(0);
  });

  it("defaults missing teams to misses_playoff", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "x", category: "cfp", school: "Iowa", odds: 5500 }),
    ];
    const out = scoreCfp(drafted, [], cfpCfg);
    expect(out[0].outcome).toBe("misses_playoff");
    expect(out[0].points).toBe(0);
  });
});

describe("scoreCinderella", () => {
  it("buckets by AP rank", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "a", category: "cinderella", school: "BYU", odds: 1500 }),
      makePick({ id: "b", category: "cinderella", school: "Tulane", odds: 2200 }),
      makePick({ id: "c", category: "cinderella", school: "SMU", odds: 3000 }),
      makePick({ id: "d", category: "cinderella", school: "Memphis", odds: 2000 }),
      makePick({ id: "e", category: "cinderella", school: "Marshall", odds: 6500 }),
    ];
    const results: ResultEntry[] = [
      { schoolName: "BYU", athleteName: null, outcome: "", finalApRank: 9 },
      { schoolName: "Tulane", athleteName: null, outcome: "", finalApRank: 16 },
      { schoolName: "SMU", athleteName: null, outcome: "", finalApRank: 22 },
      { schoolName: "Memphis", athleteName: null, outcome: "", finalApRank: 30 },
      { schoolName: "Marshall", athleteName: null, outcome: "", finalApRank: 0 },
    ];
    const out = scoreCinderella(drafted, results, cinderellaCfg);
    const byPick = Object.fromEntries(out.map((s) => [s.pickId, s]));
    expect(byPick.a.outcome).toBe("final_ap_top_10");
    expect(byPick.a.points).toBe(150);
    expect(byPick.b.outcome).toBe("final_ap_11_to_20");
    expect(byPick.b.points).toBe(75);
    expect(byPick.c.outcome).toBe("final_ap_21_to_25");
    expect(byPick.c.points).toBe(40);
    expect(byPick.d.outcome).toBe("unranked");
    expect(byPick.d.points).toBe(0);
    expect(byPick.e.outcome).toBe("unranked");
    expect(byPick.e.points).toBe(0);
  });

  it("treats missing rank as unranked", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "x", category: "cinderella", school: "Liberty", odds: 4000 }),
    ];
    const out = scoreCinderella(drafted, [], cinderellaCfg);
    expect(out[0].outcome).toBe("unranked");
    expect(out[0].points).toBe(0);
  });
});

describe("scoreConferenceChampion", () => {
  it("scales by lowest odds within same conference", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "sec1", category: "conference_champion", school: "Georgia", conference: "SEC", odds: 250 }),
      makePick({ id: "sec2", category: "conference_champion", school: "Tennessee", conference: "SEC", odds: 1500 }),
      makePick({ id: "b1g1", category: "conference_champion", school: "Ohio State", conference: "Big Ten", odds: 280 }),
      makePick({ id: "b1g2", category: "conference_champion", school: "Iowa", conference: "Big Ten", odds: 2500 }),
    ];
    const results: ResultEntry[] = [
      { schoolName: "Tennessee", athleteName: null, outcome: "wins_conference_title_game", conference: "SEC" },
      { schoolName: "Georgia", athleteName: null, outcome: "loses_conference_title_game", conference: "SEC" },
      { schoolName: "Ohio State", athleteName: null, outcome: "wins_conference_title_game", conference: "Big Ten" },
      { schoolName: "Iowa", athleteName: null, outcome: "fails_to_qualify", conference: "Big Ten" },
    ];
    const out = scoreConferenceChampion(drafted, results, confCfg);
    const byId = Object.fromEntries(out.map((s) => [s.pickId, s]));
    // SEC lowest odds = 250 (Georgia). Tennessee win: 150 × (1500/250) = 900
    expect(byId.sec2.outcome).toBe("wins_conference_title_game");
    expect(byId.sec2.points).toBeCloseTo(150 * (1500 / 250), 1);
    // Big Ten lowest odds = 280 (Ohio State). Ohio State win: 150 × (280/280) = 150
    expect(byId.b1g1.outcome).toBe("wins_conference_title_game");
    expect(byId.b1g1.points).toBeCloseTo(150, 1);
    // Iowa fails to qualify
    expect(byId.b1g2.outcome).toBe("fails_to_qualify");
    expect(byId.b1g2.points).toBe(0);
    // Georgia loses conference title: 75 × (250/250) = 75
    expect(byId.sec1.outcome).toBe("loses_conference_title_game");
    expect(byId.sec1.points).toBeCloseTo(75, 1);
  });

  it("defaults missing teams to fails_to_qualify", () => {
    const drafted: DraftedPick[] = [
      makePick({ id: "x", category: "conference_champion", school: "Baylor", conference: "Big 12", odds: 1800 }),
    ];
    const out = scoreConferenceChampion(drafted, [], confCfg);
    expect(out[0].outcome).toBe("fails_to_qualify");
    expect(out[0].points).toBe(0);
  });
});

// Test helpers ---------------------------------------------------------------

type MakePickArgs = {
  id: string;
  category?: DraftedPick["category"];
  school?: string;
  athlete?: string | null;
  conference?: string | null;
  odds: number;
};
function makePick(args: MakePickArgs): DraftedPick {
  return {
    pickId: args.id,
    playerUserId: "user-" + args.id,
    category: (args.category ?? "heisman") as DraftedPick["category"],
    schoolName: args.school ?? "Some School",
    athleteName: args.athlete ?? null,
    conference: args.conference ?? null,
    lockedOdds: args.odds,
  };
}
