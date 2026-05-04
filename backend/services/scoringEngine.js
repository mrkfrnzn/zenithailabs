/**
 * Scoring Engine
 *
 * Isolated, pure-function scoring logic with no DB or HTTP dependencies.
 * All scoring rules come from the league rules document.
 *
 * Scoring rules:
 *   - Total yards (passing + rushing + receiving) × 1 pt each
 *   - Touchdowns × 25 pts each
 *   - Interceptions × -25 pts each
 *   - QB rushing yards count positively (no negative floor for rushing yards)
 *   - No other negative scoring
 */

/**
 * Calculate the fantasy points for a single player in a single week.
 *
 * @param {object} stats
 * @param {number} stats.passingYards
 * @param {number} stats.rushingYards
 * @param {number} stats.receivingYards
 * @param {number} stats.passingTds
 * @param {number} stats.rushingTds
 * @param {number} stats.receivingTds
 * @param {number} stats.interceptions
 * @param {string} stats.position  - 'QB' | 'RB' | 'WR' | 'TE'
 * @returns {{ points: number, breakdown: object }}
 */
function calcPlayerPoints(stats) {
  const {
    passingYards   = 0,
    rushingYards   = 0,
    receivingYards = 0,
    passingTds     = 0,
    rushingTds     = 0,
    receivingTds   = 0,
    interceptions  = 0,
  } = stats;

  // Yards: 1 point per yard for all yard types
  // Note: rushing yards for QBs are never penalised — they simply count as +yards
  const yardPoints = passingYards + rushingYards + receivingYards;

  // Touchdowns: all types worth 25 pts each
  const tdPoints = (passingTds + rushingTds + receivingTds) * 25;

  // Interceptions: -25 pts each (only QBs throw INTs)
  const intPoints = interceptions * -25;

  const total = yardPoints + tdPoints + intPoints;

  return {
    points: total,
    breakdown: {
      yardPoints,
      tdPoints,
      intPoints,
      passingYards,
      rushingYards,
      receivingYards,
      passingTds,
      rushingTds,
      receivingTds,
      interceptions,
    },
  };
}

/**
 * Calculate the total score for a weekly lineup given slot stats.
 *
 * @param {object} slotStats  - keyed by slot type: { QB: statsObj, RB: statsObj, FLEX: statsObj }
 * @returns {{ totalPoints: number, slots: object }}
 */
function calcLineupScore(slotStats) {
  const slots = {};
  let totalPoints = 0;

  for (const [slot, stats] of Object.entries(slotStats)) {
    const result = calcPlayerPoints(stats);
    slots[slot] = result;
    totalPoints += result.points;
  }

  return { totalPoints, slots };
}

/**
 * Rank an array of standings entries by total_points descending.
 * Ties are broken by entry_id alphabetically (deterministic).
 *
 * @param {Array<{ entry_id: string, total_points: number }>} entries
 * @returns {Array<{ entry_id: string, total_points: number, rank: number }>}
 */
function rankStandings(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return a.entry_id.localeCompare(b.entry_id); // deterministic tiebreak
  });

  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

/**
 * Validate that a lineup has no duplicate NFL players vs. previously used players.
 *
 * @param {string[]} newPlayerIds       - player IDs in the new lineup
 * @param {string[]} usedPlayerIds      - player IDs used in prior weeks
 * @returns {{ valid: boolean, conflicts: string[] }}
 */
function validateNoRepeatPlayers(newPlayerIds, usedPlayerIds) {
  const usedSet = new Set(usedPlayerIds);
  const conflicts = newPlayerIds.filter(id => usedSet.has(id));
  return { valid: conflicts.length === 0, conflicts };
}

/**
 * Validate that a lineup has all required slots filled.
 *
 * @param {object} lineup  - { QB: id, RB: id, FLEX: id }
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateLineupSlots(lineup) {
  const required = ['QB', 'RB', 'FLEX'];
  const missing = required.filter(slot => !lineup[slot]);
  return { valid: missing.length === 0, missing };
}

module.exports = {
  calcPlayerPoints,
  calcLineupScore,
  rankStandings,
  validateNoRepeatPlayers,
  validateLineupSlots,
};
