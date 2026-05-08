// Snake draft order generator and turn calculation utilities.

export type DraftSegmentInput = {
  id: string;
  category: string;
  segmentOrder: number;
  pickCountPerPlayer: number;
};

export type SnakePick = {
  overallPickNumber: number;
  segmentId: string;
  category: string;
  roundNumberInSegment: number; // 1-based
  playerSlot: number; // 1-based draft slot
};

export function buildSnakeOrder(
  segments: DraftSegmentInput[],
  playerCount: number,
): SnakePick[] {
  const ordered = [...segments].sort((a, b) => a.segmentOrder - b.segmentOrder);
  const picks: SnakePick[] = [];
  let overall = 1;
  for (const seg of ordered) {
    for (let round = 1; round <= seg.pickCountPerPlayer; round++) {
      const ascending = round % 2 === 1;
      for (let i = 0; i < playerCount; i++) {
        const slot = ascending ? i + 1 : playerCount - i;
        picks.push({
          overallPickNumber: overall++,
          segmentId: seg.id,
          category: seg.category,
          roundNumberInSegment: round,
          playerSlot: slot,
        });
      }
    }
  }
  return picks;
}

export function totalPicksFor(segments: DraftSegmentInput[], playerCount: number): number {
  return segments.reduce((sum, s) => sum + s.pickCountPerPlayer * playerCount, 0);
}
