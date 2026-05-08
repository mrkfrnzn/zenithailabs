// Parses uploaded result rows into a normalized shape per category and matches them
// against draftable entities by normalized name.

import type { CsvRow } from "./csv";
import { normalizeName, parseInteger } from "./normalize";
import type { Category } from "./categories";

export type ParsedResultRow = {
  rawRow: CsvRow;
  normalized: {
    schoolName: string;
    athleteName?: string | null;
    outcome?: string | null;
    finalApRank?: number | null;
    conference?: string | null;
    matchKey: string;
  };
  errors: string[];
};

export function categoryToResultType(category: Category): string {
  if (category === "conference_champion") return "conference";
  return category;
}

export function resultTypeToCategory(rt: string): Category {
  if (rt === "conference") return "conference_champion";
  return rt as Category;
}

const ALLOWED_OUTCOMES: Record<string, string[]> = {
  heisman: ["winner", "finalist_non_winner"],
  cfp: ["wins_national_title", "loses_final", "loses_semifinal", "makes_playoff_no_semifinal", "misses_playoff"],
  conference: ["wins_conference_title_game", "loses_conference_title_game", "fails_to_qualify"],
  // cinderella has no outcome column (derived from final_ap_rank)
};

export function parseResultRows(resultType: string, rows: CsvRow[]): ParsedResultRow[] {
  return rows.map((raw) => {
    const errors: string[] = [];
    const schoolName = (raw.school_name || raw.school || "").trim();
    const athleteName = (raw.athlete_name || raw.athlete || "").trim();
    const outcomeRaw = (raw.outcome || "").trim().toLowerCase().replace(/\s+/g, "_");
    const conference = (raw.conference || "").trim() || null;
    const finalApRank = parseInteger(raw.final_ap_rank ?? raw.ap_rank ?? raw.rank ?? null);
    const allowed = ALLOWED_OUTCOMES[resultType];

    if (!schoolName && resultType !== "heisman") errors.push("Missing school_name.");
    if (resultType === "heisman" && !athleteName && !schoolName) errors.push("Missing athlete_name.");
    if (resultType === "cinderella") {
      if (finalApRank === null) errors.push("Missing/invalid final_ap_rank.");
    } else {
      if (allowed && !allowed.includes(outcomeRaw)) {
        errors.push(`Outcome must be one of: ${allowed.join(", ")}.`);
      }
    }

    const matchKey = normalizeName(athleteName || schoolName);
    return {
      rawRow: raw,
      normalized: {
        schoolName,
        athleteName: athleteName || null,
        outcome: resultType === "cinderella" ? outcomeFromRank(finalApRank) : outcomeRaw || null,
        finalApRank,
        conference,
        matchKey,
      },
      errors,
    };
  });
}

function outcomeFromRank(rank: number | null) {
  if (rank === null || rank === undefined || rank <= 0) return "unranked";
  if (rank <= 10) return "final_ap_top_10";
  if (rank <= 20) return "final_ap_11_to_20";
  if (rank <= 25) return "final_ap_21_to_25";
  return "unranked";
}
