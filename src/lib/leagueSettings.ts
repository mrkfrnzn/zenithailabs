import { defaultLeagueSettings, LeagueSettings } from "./categories";
import type { League } from "@prisma/client";

export function readLeagueSettings(league: Pick<League, "settingsJson">): LeagueSettings {
  try {
    const parsed = JSON.parse(league.settingsJson || "{}");
    return { ...defaultLeagueSettings(), ...parsed };
  } catch {
    return defaultLeagueSettings();
  }
}

export function writeLeagueSettings(settings: LeagueSettings): string {
  return JSON.stringify(settings);
}
