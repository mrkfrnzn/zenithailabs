/**
 * Payout Service
 *
 * Isolated payout calculation logic.
 * Payout tiers are defined in the DB (payout_rules) and in the league rules doc.
 *
 * House always retains 10% of total pot.
 * Percentages must sum to 100%.
 */

/**
 * Get the applicable payout rule for a given participant count.
 *
 * Tiers (from league rules):
 *   1–5   → 1st: 90%, House: 10%
 *   6–10  → 1st: 70%, 2nd: 20%, House: 10%
 *   11–15 → 1st: 60%, 2nd: 25%, 3rd: 5%,  House: 10%
 *   16–20 → 1st: 55%, 2nd: 25%, 3rd: 10%, House: 10%
 *   21–30 → 1st: 50%, 2nd: 25%, 3rd: 15%, House: 10%
 *   31–50 → 1st: 50%, 2nd: 20%, 3rd: 15%, 4th: 5%, House: 10%
 *
 * @param {Array<object>} rules   - rows from payout_rules table
 * @param {number}        count   - number of paid participants
 * @returns {object|null}         - matching rule row or null
 */
function findApplicableRule(rules, count) {
  return rules.find(r => count >= r.min_players && count <= r.max_players) || null;
}

/**
 * Calculate payout amounts given a rule and total pot.
 *
 * @param {object} rule         - payout rule (first_pct, second_pct, etc.)
 * @param {number} totalPot     - total money collected from participants
 * @param {Array}  rankedEntries - entries sorted by rank [{entry_id, rank, user}...]
 * @returns {Array<{ label, rank, entryId, pct, amount }>}
 */
function calcPayouts(rule, totalPot, rankedEntries) {
  if (!rule || !totalPot) return [];

  const results = [];

  const tiers = [
    { rank: 1, label: '1st Place', pct: rule.first_pct  || 0 },
    { rank: 2, label: '2nd Place', pct: rule.second_pct || 0 },
    { rank: 3, label: '3rd Place', pct: rule.third_pct  || 0 },
    { rank: 4, label: '4th Place', pct: rule.fourth_pct || 0 },
  ];

  for (const tier of tiers) {
    if (tier.pct <= 0) continue;
    const entry = rankedEntries.find(e => e.rank === tier.rank);
    results.push({
      label:   tier.label,
      rank:    tier.rank,
      entryId: entry ? entry.entry_id : null,
      pct:     tier.pct,
      amount:  round2(totalPot * (tier.pct / 100)),
    });
  }

  // House cut
  results.push({
    label:   'House',
    rank:    null,
    entryId: null,
    pct:     rule.house_pct || 10,
    amount:  round2(totalPot * ((rule.house_pct || 10) / 100)),
  });

  return results;
}

/**
 * Convenience: compute everything given entry fee, paid count, and rules.
 *
 * @param {number} entryFee
 * @param {number} paidCount
 * @param {Array}  rules
 * @param {Array}  rankedEntries
 * @returns {{ totalPot, houseCut, prizePool, rule, payouts }}
 */
function computePayoutSummary(entryFee, paidCount, rules, rankedEntries) {
  const totalPot  = round2(entryFee * paidCount);
  const rule      = findApplicableRule(rules, paidCount);
  const housePct  = rule ? (rule.house_pct || 10) : 10;
  const houseCut  = round2(totalPot * (housePct / 100));
  const prizePool = round2(totalPot - houseCut);
  const payouts   = calcPayouts(rule, totalPot, rankedEntries);

  return { totalPot, houseCut, prizePool, rule, payouts };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { findApplicableRule, calcPayouts, computePayoutSummary };
