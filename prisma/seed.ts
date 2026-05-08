// CFB War Chest seed script.
// Creates an admin, six players, and a fully configured league ready to draft.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_SCORING,
  defaultLeagueSettings,
} from "../src/lib/categories";
import { normalizeName } from "../src/lib/normalize";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@warchest.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Commissioner";

const PLAYERS: { email: string; name: string }[] = [
  { email: "player1@warchest.local", name: "Avery" },
  { email: "player2@warchest.local", name: "Blake" },
  { email: "player3@warchest.local", name: "Casey" },
  { email: "player4@warchest.local", name: "Dakota" },
  { email: "player5@warchest.local", name: "Emerson" },
  { email: "player6@warchest.local", name: "Finley" },
];
const PLAYER_PASSWORD = "player123";

// Reduced pick counts so a draft can complete from this seed without needing
// hundreds of entities. Admin can adjust before locking via /draft-setup.
const SEEDED_PICK_COUNTS = {
  heisman: 2,
  cfp: 3,
  cinderella: 3,
  conference_champion: 6,
};

const SEGMENT_ORDER = ["heisman", "cfp", "cinderella", "conference_champion"] as const;

// Sample data — fictional/illustrative odds tuned for a balanced demo.

type EntitySeed = {
  entityType: "athlete" | "school";
  schoolName: string;
  athleteName?: string;
  conference?: string;
  position?: string;
  preseasonRank?: number;
  oddsAmerican: number;
  oddsSource?: string;
  eligibleCategories: string[];
};

const HEISMAN: EntitySeed[] = [
  { entityType: "athlete", athleteName: "Quinn Stryker", schoolName: "Georgia",  conference: "SEC",     position: "QB", preseasonRank: 1,  oddsAmerican: 700, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Marcus Hale",   schoolName: "Texas",    conference: "SEC",     position: "QB", preseasonRank: 3,  oddsAmerican: 800, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Jaden Pierce",  schoolName: "Ohio State",conference: "Big Ten", position: "QB", preseasonRank: 2,  oddsAmerican: 850, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Ronan Vega",    schoolName: "Oregon",   conference: "Big Ten", position: "QB", preseasonRank: 4,  oddsAmerican: 1200, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Tariq Bell",    schoolName: "Alabama",  conference: "SEC",     position: "RB", preseasonRank: 5,  oddsAmerican: 1500, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Owen Briggs",   schoolName: "Penn State",conference: "Big Ten", position: "QB", preseasonRank: 6,  oddsAmerican: 1800, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Devon Mariner", schoolName: "Michigan", conference: "Big Ten", position: "QB", preseasonRank: 7,  oddsAmerican: 2200, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Silas Penn",    schoolName: "Notre Dame",conference: "ACC",    position: "QB", preseasonRank: 8,  oddsAmerican: 2500, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Kade Roman",    schoolName: "LSU",      conference: "SEC",     position: "WR", preseasonRank: 9,  oddsAmerican: 2800, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Beau Harlan",   schoolName: "Florida State",conference: "ACC", position: "QB", preseasonRank: 10, oddsAmerican: 3000, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Theo Vance",    schoolName: "USC",      conference: "Big Ten", position: "QB", preseasonRank: 12, oddsAmerican: 3500, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Asher Crowe",   schoolName: "Clemson",  conference: "ACC",     position: "QB", preseasonRank: 11, oddsAmerican: 4000, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Niko Hayes",    schoolName: "Oklahoma", conference: "SEC",     position: "QB", preseasonRank: 14, oddsAmerican: 5000, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Zane Whitlock", schoolName: "Tennessee",conference: "SEC",     position: "QB", preseasonRank: 13, oddsAmerican: 5500, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Mateo Quinn",   schoolName: "Utah",     conference: "Big 12",  position: "QB", preseasonRank: 15, oddsAmerican: 6500, eligibleCategories: ["heisman"] },
  { entityType: "athlete", athleteName: "Cyrus Lane",    schoolName: "Miami",    conference: "ACC",     position: "QB", preseasonRank: 16, oddsAmerican: 7500, eligibleCategories: ["heisman"] },
];

const CFP: EntitySeed[] = [
  { entityType: "school", schoolName: "Georgia",        conference: "SEC",     preseasonRank: 1,  oddsAmerican: 450,  eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Ohio State",     conference: "Big Ten", preseasonRank: 2,  oddsAmerican: 500,  eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Texas",          conference: "SEC",     preseasonRank: 3,  oddsAmerican: 650,  eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Oregon",         conference: "Big Ten", preseasonRank: 4,  oddsAmerican: 750,  eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Alabama",        conference: "SEC",     preseasonRank: 5,  oddsAmerican: 900,  eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Penn State",     conference: "Big Ten", preseasonRank: 6,  oddsAmerican: 1100, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Michigan",       conference: "Big Ten", preseasonRank: 7,  oddsAmerican: 1300, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Notre Dame",     conference: "ACC",     preseasonRank: 8,  oddsAmerican: 1500, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "LSU",            conference: "SEC",     preseasonRank: 9,  oddsAmerican: 1800, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Florida State",  conference: "ACC",     preseasonRank: 10, oddsAmerican: 2000, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Clemson",        conference: "ACC",     preseasonRank: 11, oddsAmerican: 2200, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "USC",            conference: "Big Ten", preseasonRank: 12, oddsAmerican: 2500, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Tennessee",      conference: "SEC",     preseasonRank: 13, oddsAmerican: 2800, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Oklahoma",       conference: "SEC",     preseasonRank: 14, oddsAmerican: 3200, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Utah",           conference: "Big 12",  preseasonRank: 15, oddsAmerican: 3500, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Miami",          conference: "ACC",     preseasonRank: 16, oddsAmerican: 4000, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Auburn",         conference: "SEC",     preseasonRank: 17, oddsAmerican: 4500, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Texas A&M",      conference: "SEC",     preseasonRank: 18, oddsAmerican: 5000, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Iowa",           conference: "Big Ten", preseasonRank: 19, oddsAmerican: 5500, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Washington",     conference: "Big Ten", preseasonRank: 20, oddsAmerican: 6000, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Kansas State",   conference: "Big 12",  preseasonRank: 21, oddsAmerican: 6500, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Mississippi",    conference: "SEC",     preseasonRank: 22, oddsAmerican: 7000, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Wisconsin",      conference: "Big Ten", preseasonRank: 23, oddsAmerican: 8000, eligibleCategories: ["cfp"] },
  { entityType: "school", schoolName: "Iowa State",     conference: "Big 12",  preseasonRank: 24, oddsAmerican: 9000, eligibleCategories: ["cfp"] },
];

// Cinderella pool: schools outside preseason top 25.
const CINDERELLA: EntitySeed[] = [
  { entityType: "school", schoolName: "BYU",           conference: "Big 12",  preseasonRank: 28, oddsAmerican: 1500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Colorado",      conference: "Big 12",  preseasonRank: 30, oddsAmerican: 1800, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Memphis",       conference: "AAC",     preseasonRank: 32, oddsAmerican: 2000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Tulane",        conference: "AAC",     preseasonRank: 33, oddsAmerican: 2200, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Boise State",   conference: "Mountain West", preseasonRank: 34, oddsAmerican: 2500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "James Madison", conference: "Sun Belt", preseasonRank: 35, oddsAmerican: 2800, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "SMU",           conference: "ACC",     preseasonRank: 36, oddsAmerican: 3000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "UNLV",          conference: "Mountain West", preseasonRank: 38, oddsAmerican: 3500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Liberty",       conference: "Conference USA", preseasonRank: 40, oddsAmerican: 4000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Toledo",        conference: "MAC",     preseasonRank: 42, oddsAmerican: 4500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Coastal Carolina", conference: "Sun Belt", preseasonRank: 44, oddsAmerican: 5000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Western Kentucky", conference: "Conference USA", preseasonRank: 45, oddsAmerican: 5500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Air Force",     conference: "Mountain West", preseasonRank: 46, oddsAmerican: 6000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Marshall",      conference: "Sun Belt", preseasonRank: 48, oddsAmerican: 6500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Northern Illinois", conference: "MAC", preseasonRank: 50, oddsAmerican: 7000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Troy",          conference: "Sun Belt", preseasonRank: 52, oddsAmerican: 7500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Appalachian State", conference: "Sun Belt", preseasonRank: 55, oddsAmerican: 8000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Wyoming",       conference: "Mountain West", preseasonRank: 58, oddsAmerican: 9000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Ohio",          conference: "MAC",     preseasonRank: 60, oddsAmerican: 10000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "South Florida", conference: "AAC",     preseasonRank: 62, oddsAmerican: 11000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Arkansas State",conference: "Sun Belt", preseasonRank: 65, oddsAmerican: 12500, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Buffalo",       conference: "MAC",     preseasonRank: 68, oddsAmerican: 14000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Old Dominion",  conference: "Sun Belt", preseasonRank: 70, oddsAmerican: 16000, eligibleCategories: ["cinderella"] },
  { entityType: "school", schoolName: "Georgia State", conference: "Sun Belt", preseasonRank: 75, oddsAmerican: 20000, eligibleCategories: ["cinderella"] },
];

// Conference champion pool: ~7 schools per Power 5 conference, distinct from CFP names where possible.
const CONFERENCE: EntitySeed[] = [
  // SEC
  { entityType: "school", schoolName: "Georgia (SEC)",         conference: "SEC",     preseasonRank: 1,  oddsAmerican: 250, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Texas (SEC)",           conference: "SEC",     preseasonRank: 3,  oddsAmerican: 350, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Alabama (SEC)",         conference: "SEC",     preseasonRank: 5,  oddsAmerican: 500, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "LSU (SEC)",             conference: "SEC",     preseasonRank: 9,  oddsAmerican: 900, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Tennessee (SEC)",       conference: "SEC",     preseasonRank: 13, oddsAmerican: 1500, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Auburn (SEC)",          conference: "SEC",     preseasonRank: 17, oddsAmerican: 2200, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Mississippi (SEC)",     conference: "SEC",     preseasonRank: 22, oddsAmerican: 3000, eligibleCategories: ["conference_champion"] },
  // Big Ten
  { entityType: "school", schoolName: "Ohio State (B1G)",      conference: "Big Ten", preseasonRank: 2,  oddsAmerican: 280, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Oregon (B1G)",          conference: "Big Ten", preseasonRank: 4,  oddsAmerican: 400, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Penn State (B1G)",      conference: "Big Ten", preseasonRank: 6,  oddsAmerican: 800, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Michigan (B1G)",        conference: "Big Ten", preseasonRank: 7,  oddsAmerican: 1000, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "USC (B1G)",             conference: "Big Ten", preseasonRank: 12, oddsAmerican: 1800, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Iowa (B1G)",            conference: "Big Ten", preseasonRank: 19, oddsAmerican: 2500, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Wisconsin (B1G)",       conference: "Big Ten", preseasonRank: 23, oddsAmerican: 4000, eligibleCategories: ["conference_champion"] },
  // Big 12
  { entityType: "school", schoolName: "Utah (B12)",            conference: "Big 12",  preseasonRank: 15, oddsAmerican: 350, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Kansas State (B12)",    conference: "Big 12",  preseasonRank: 21, oddsAmerican: 500, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Iowa State (B12)",      conference: "Big 12",  preseasonRank: 24, oddsAmerican: 800, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Oklahoma State (B12)",  conference: "Big 12",  preseasonRank: 26, oddsAmerican: 1100, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "TCU (B12)",             conference: "Big 12",  preseasonRank: 27, oddsAmerican: 1400, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Baylor (B12)",          conference: "Big 12",  preseasonRank: 31, oddsAmerican: 1800, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Cincinnati (B12)",      conference: "Big 12",  preseasonRank: 37, oddsAmerican: 2500, eligibleCategories: ["conference_champion"] },
  // ACC
  { entityType: "school", schoolName: "Florida State (ACC)",   conference: "ACC",     preseasonRank: 10, oddsAmerican: 350, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Clemson (ACC)",         conference: "ACC",     preseasonRank: 11, oddsAmerican: 400, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Miami (ACC)",           conference: "ACC",     preseasonRank: 16, oddsAmerican: 600, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "North Carolina (ACC)",  conference: "ACC",     preseasonRank: 25, oddsAmerican: 1200, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Louisville (ACC)",      conference: "ACC",     preseasonRank: 29, oddsAmerican: 1500, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Pittsburgh (ACC)",      conference: "ACC",     preseasonRank: 39, oddsAmerican: 2400, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "NC State (ACC)",        conference: "ACC",     preseasonRank: 41, oddsAmerican: 3000, eligibleCategories: ["conference_champion"] },
  // Pac-12
  { entityType: "school", schoolName: "Washington State (P12)",conference: "Pac-12",  preseasonRank: 33, oddsAmerican: 250, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Oregon State (P12)",    conference: "Pac-12",  preseasonRank: 34, oddsAmerican: 280, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Boise State (P12)",     conference: "Pac-12",  preseasonRank: 28, oddsAmerican: 350, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "San Diego State (P12)", conference: "Pac-12",  preseasonRank: 47, oddsAmerican: 700, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Fresno State (P12)",    conference: "Pac-12",  preseasonRank: 49, oddsAmerican: 900, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Colorado State (P12)",  conference: "Pac-12",  preseasonRank: 53, oddsAmerican: 1500, eligibleCategories: ["conference_champion"] },
  { entityType: "school", schoolName: "Air Force (P12)",       conference: "Pac-12",  preseasonRank: 46, oddsAmerican: 2000, eligibleCategories: ["conference_champion"] },
];

async function main() {
  console.log("Seeding CFB War Chest...");

  // Wipe transactional data so seeding is idempotent.
  // Order matters due to FK constraints.
  await prisma.score.deleteMany({});
  await prisma.resultRow.deleteMany({});
  await prisma.resultImport.deleteMany({});
  await prisma.draftPick.deleteMany({});
  await prisma.draftState.deleteMany({});
  await prisma.draftSegment.deleteMany({});
  await prisma.draftableEntity.deleteMany({});
  await prisma.scoringConfig.deleteMany({});
  await prisma.trashTalkPost.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.leagueMember.deleteMany({});
  await prisma.league.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});

  // Admin
  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      displayName: ADMIN_NAME,
      passwordHash: await hash(ADMIN_PASSWORD),
      role: "admin",
    },
  });
  console.log(`  admin: ${admin.email} / ${ADMIN_PASSWORD}`);

  // Players
  const playerUsers = [];
  for (const p of PLAYERS) {
    const u = await prisma.user.create({
      data: {
        email: p.email,
        displayName: p.name,
        passwordHash: await hash(PLAYER_PASSWORD),
        role: "player",
      },
    });
    playerUsers.push(u);
  }
  console.log(`  ${playerUsers.length} players seeded (password: ${PLAYER_PASSWORD})`);

  // League settings: use exclusive_within_category_only so the school-named
  // conference entries can co-exist with CFP entries by the same school.
  const settings = {
    ...defaultLeagueSettings(),
    exclusivity: "exclusive_within_category_only" as const,
    pickCounts: SEEDED_PICK_COUNTS,
    maxPlayers: 6,
  };

  const league = await prisma.league.create({
    data: {
      name: "The Group Chat 2025",
      seasonYear: 2025,
      createdById: admin.id,
      status: "draft_ready",
      settingsJson: JSON.stringify(settings),
    },
  });
  console.log(`  league: ${league.name}`);

  // Members
  for (let i = 0; i < playerUsers.length; i++) {
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: playerUsers[i].id,
        displayName: playerUsers[i].displayName,
        draftPosition: i + 1,
      },
    });
  }

  // Scoring configs
  for (const [category, cfg] of Object.entries(DEFAULT_SCORING)) {
    await prisma.scoringConfig.create({
      data: {
        leagueId: league.id,
        category,
        configJson: JSON.stringify(cfg),
        locked: true,
      },
    });
  }

  // Draft segments
  for (let i = 0; i < SEGMENT_ORDER.length; i++) {
    const cat = SEGMENT_ORDER[i];
    await prisma.draftSegment.create({
      data: {
        leagueId: league.id,
        category: cat,
        segmentOrder: i + 1,
        pickCountPerPlayer: SEEDED_PICK_COUNTS[cat],
      },
    });
  }

  // Draft state
  await prisma.draftState.create({
    data: { leagueId: league.id, status: "not_started" },
  });

  // Draftable entities
  const all: EntitySeed[] = [...HEISMAN, ...CFP, ...CINDERELLA, ...CONFERENCE];
  for (const e of all) {
    const baseName = e.athleteName ?? e.schoolName;
    await prisma.draftableEntity.create({
      data: {
        leagueId: league.id,
        entityType: e.entityType,
        athleteName: e.athleteName ?? null,
        schoolName: e.schoolName,
        conference: e.conference ?? null,
        position: e.position ?? null,
        preseasonRank: e.preseasonRank ?? null,
        oddsAmerican: e.oddsAmerican,
        oddsSource: e.oddsSource ?? "seed",
        eligibleCategoriesJson: JSON.stringify(e.eligibleCategories),
        rawImportJson: JSON.stringify(e),
        normalizedName: normalizeName(baseName),
        locked: true,
      },
    });
  }
  console.log(
    `  ${HEISMAN.length} heisman, ${CFP.length} cfp, ${CINDERELLA.length} cinderella, ${CONFERENCE.length} conference`,
  );

  // A friendly trash talk post to make the board non-empty for screenshots
  await prisma.trashTalkPost.create({
    data: {
      leagueId: league.id,
      userId: playerUsers[0].id,
      body: "Locked in. May the most degenerate odds-chaser win.",
    },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
