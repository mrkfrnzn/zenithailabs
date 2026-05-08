import { describe, it, expect } from "vitest";
import { buildSnakeOrder, totalPicksFor, type DraftSegmentInput } from "../draft";

function seg(id: string, category: string, order: number, picks: number): DraftSegmentInput {
  return { id, category, segmentOrder: order, pickCountPerPlayer: picks };
}

describe("totalPicksFor", () => {
  it("returns 0 for empty segments", () => {
    expect(totalPicksFor([], 6)).toBe(0);
  });

  it("single segment, single round", () => {
    expect(totalPicksFor([seg("s1", "heisman", 1, 1)], 6)).toBe(6);
  });

  it("multiple segments summed correctly", () => {
    const segments = [
      seg("s1", "heisman", 1, 2),
      seg("s2", "cfp", 2, 3),
      seg("s3", "cinderella", 3, 3),
      seg("s4", "conference_champion", 4, 6),
    ];
    // (2 + 3 + 3 + 6) * 6 players = 84
    expect(totalPicksFor(segments, 6)).toBe(84);
  });
});

describe("buildSnakeOrder", () => {
  it("returns empty array for no segments", () => {
    expect(buildSnakeOrder([], 6)).toEqual([]);
  });

  it("single segment, 1 round, 4 players — ascending order", () => {
    const picks = buildSnakeOrder([seg("s1", "heisman", 1, 1)], 4);
    expect(picks).toHaveLength(4);
    expect(picks.map((p) => p.playerSlot)).toEqual([1, 2, 3, 4]);
    expect(picks.every((p) => p.segmentId === "s1")).toBe(true);
    expect(picks.every((p) => p.category === "heisman")).toBe(true);
  });

  it("single segment, 2 rounds: round 1 ascending, round 2 descending", () => {
    const picks = buildSnakeOrder([seg("s1", "heisman", 1, 2)], 4);
    expect(picks).toHaveLength(8);
    // round 1: slots 1,2,3,4
    expect(picks.slice(0, 4).map((p) => p.playerSlot)).toEqual([1, 2, 3, 4]);
    // round 2: slots 4,3,2,1
    expect(picks.slice(4, 8).map((p) => p.playerSlot)).toEqual([4, 3, 2, 1]);
  });

  it("round numbering resets per segment", () => {
    const picks = buildSnakeOrder(
      [seg("s1", "heisman", 1, 2), seg("s2", "cfp", 2, 2)],
      3,
    );
    const s1picks = picks.filter((p) => p.segmentId === "s1");
    const s2picks = picks.filter((p) => p.segmentId === "s2");
    expect(s1picks.map((p) => p.roundNumberInSegment)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(s2picks.map((p) => p.roundNumberInSegment)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it("overall pick numbers are sequential across segments", () => {
    const picks = buildSnakeOrder(
      [seg("s1", "heisman", 1, 1), seg("s2", "cfp", 2, 1)],
      3,
    );
    expect(picks.map((p) => p.overallPickNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("segments are sorted by segmentOrder regardless of input order", () => {
    const picks = buildSnakeOrder(
      [seg("s2", "cfp", 2, 1), seg("s1", "heisman", 1, 1)],
      2,
    );
    expect(picks[0].category).toBe("heisman");
    expect(picks[2].category).toBe("cfp");
  });

  it("3-round snake alternates correctly for 3 players", () => {
    const picks = buildSnakeOrder([seg("s1", "heisman", 1, 3)], 3);
    // round 1 (odd): 1,2,3
    // round 2 (even): 3,2,1
    // round 3 (odd): 1,2,3
    expect(picks.map((p) => p.playerSlot)).toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3]);
  });

  it("typical league: 6 players, heisman 2 rounds + cfp 3 rounds = 30 picks", () => {
    const picks = buildSnakeOrder(
      [seg("s1", "heisman", 1, 2), seg("s2", "cfp", 2, 3)],
      6,
    );
    expect(picks).toHaveLength(30);
    expect(picks[picks.length - 1].overallPickNumber).toBe(30);
  });

  it("each player gets exactly pickCountPerPlayer picks per segment", () => {
    const picks = buildSnakeOrder([seg("s1", "cinderella", 1, 3)], 6);
    for (let slot = 1; slot <= 6; slot++) {
      const playerPicks = picks.filter((p) => p.playerSlot === slot);
      expect(playerPicks).toHaveLength(3);
    }
  });
});
