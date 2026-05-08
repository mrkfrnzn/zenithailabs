// Category constants used across the app.
// Keeping these in one place makes future expansion easier.

export const CATEGORIES = ["heisman", "cfp", "cinderella", "conference_champion"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  heisman: "Heisman",
  cfp: "College Football Playoff",
  cinderella: "Cinderella",
  conference_champion: "Conference Champion",
};

export const CATEGORY_ENTITY_TYPE: Record<Category, "athlete" | "school"> = {
  heisman: "athlete",
  cfp: "school",
  cinderella: "school",
  conference_champion: "school",
};

export const DEFAULT_PICK_COUNTS: Record<Category, number> = {
  heisman: 2,
  cfp: 4,
  cinderella: 4,
  conference_champion: 15,
};

export const DEFAULT_SEGMENT_ORDER: Category[] = [
  "heisman",
  "cfp",
  "cinderella",
  "conference_champion",
];

// Default scoring config per category. Admin-editable via UI before draft lock.
export const DEFAULT_SCORING: Record<Category, ScoringConfigShape> = {
  heisman: {
    formula: "multiplier_x_odds_ratio",
    multipliers: {
      winner: 350,
      finalist_non_winner: 100,
      no_score: 0,
    },
    notes: "points = multiplier × (entity_odds / lowest_drafted_odds_in_category)",
  },
  cfp: {
    formula: "multiplier_x_odds_ratio",
    multipliers: {
      wins_national_title: 300,
      loses_final: 200,
      loses_semifinal: 100,
      makes_playoff_no_semifinal: 20,
      misses_playoff: 0,
    },
    notes: "points = multiplier × (entity_odds / lowest_drafted_odds_in_category)",
  },
  cinderella: {
    formula: "fixed_points_by_bucket",
    multipliers: {
      final_ap_top_10: 150,
      final_ap_11_to_20: 75,
      final_ap_21_to_25: 40,
      unranked: 0,
    },
    notes: "Fixed points by final AP poll bucket.",
  },
  conference_champion: {
    formula: "multiplier_x_odds_ratio_per_conference",
    multipliers: {
      wins_conference_title_game: 150,
      loses_conference_title_game: 75,
      fails_to_qualify: 0,
    },
    notes:
      "points = multiplier × (entity_odds / lowest_drafted_odds_in_same_conference)",
  },
};

export type ScoringConfigShape = {
  formula: string;
  multipliers: Record<string, number>;
  notes?: string;
};

// Default league settings - admin-editable up until draft lock.
export type LeagueSettings = {
  pickCounts: Record<Category, number>;
  segmentOrder: Category[];
  exclusivity: "global_across_all_categories" | "exclusive_within_category_only";
  cinderellaEligibility: {
    type: "outside_top_25" | "min_preseason_rank";
    minPreseasonRank: number; // used if type === "min_preseason_rank"
  };
  conferences: string[]; // list of conferences in scope
  trashTalkEnabled: boolean;
  trashTalkAllowSelfDelete: boolean;
  publishProvisionalStandings: boolean;
  draftTimerSeconds: number; // 0 = no timer
};

export function defaultLeagueSettings(): LeagueSettings {
  return {
    pickCounts: { ...DEFAULT_PICK_COUNTS },
    segmentOrder: [...DEFAULT_SEGMENT_ORDER],
    exclusivity: "global_across_all_categories",
    cinderellaEligibility: { type: "outside_top_25", minPreseasonRank: 26 },
    conferences: ["SEC", "Big Ten", "Big 12", "ACC", "Pac-12"],
    trashTalkEnabled: true,
    trashTalkAllowSelfDelete: true,
    publishProvisionalStandings: false,
    draftTimerSeconds: 0,
  };
}
