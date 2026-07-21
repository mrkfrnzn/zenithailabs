-- CFP War Chest — one-shot database setup
-- Paste this ENTIRE file into: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Runs migrations 001 -> 002 -> 003 in order on a fresh project.
-- Seed data (002) is idempotent (ON CONFLICT DO NOTHING), so a re-run is safe.

-- ============================================================
-- 001_initial_schema.sql — tables, RLS, indexes, realtime, triggers
-- ============================================================
-- CFB War Chest 2026 — Initial Schema
-- Migration 001: All tables from PRD Section 6

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- USERS (extends Supabase auth.users via profile table)
-- ============================================================
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  display_name text not null,
  role        text not null check (role in ('admin', 'player')) default 'player',
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_own_read" on public.users
  for select using (auth.uid() = id);

create policy "users_admin_read" on public.users
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "users_service_all" on public.users
  for all using (auth.role() = 'service_role');

-- ============================================================
-- LEAGUES
-- ============================================================
create table public.leagues (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  season_year  integer not null,
  status       text not null default 'setup' check (status in (
    'setup','data_imported','draft_ready','drafting','drafted','scoring','completed'
  )),
  settings_json jsonb not null default '{}',
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.leagues enable row level security;

create policy "leagues_member_read" on public.leagues
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = id and lm.user_id = auth.uid()
    )
  );

create policy "leagues_admin_write" on public.leagues
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ============================================================
-- LEAGUE MEMBERS
-- ============================================================
create table public.league_members (
  id              uuid primary key default uuid_generate_v4(),
  league_id       uuid not null references public.leagues(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  display_name    text not null,
  role_in_league  text not null default 'player' check (role_in_league in ('admin', 'player')),
  draft_position  integer,
  invite_status   text not null default 'pending' check (invite_status in ('pending', 'accepted')),
  created_at      timestamptz not null default now(),
  unique(league_id, user_id)
);

alter table public.league_members enable row level security;

create policy "league_members_read" on public.league_members
  for select using (
    exists (
      select 1 from public.league_members lm2
      where lm2.league_id = league_id and lm2.user_id = auth.uid()
    )
  );

create policy "league_members_service_all" on public.league_members
  for all using (auth.role() = 'service_role');

create policy "league_members_admin_write" on public.league_members
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ============================================================
-- DRAFTABLE ENTITIES
-- ============================================================
create table public.draftable_entities (
  id                      uuid primary key default uuid_generate_v4(),
  league_id               uuid not null references public.leagues(id) on delete cascade,
  entity_type             text not null check (entity_type in ('athlete', 'school')),
  athlete_name            text,
  school_name             text,
  conference              text,
  position                text,
  preseason_rank          integer,
  odds                    integer,
  odds_source             text,
  eligible_categories_json jsonb not null default '[]',
  raw_import_json         jsonb not null default '{}',
  normalized_name         text not null,
  locked                  boolean not null default false,
  created_at              timestamptz not null default now()
);

alter table public.draftable_entities enable row level security;

create index on public.draftable_entities (league_id);
create index on public.draftable_entities using gin (eligible_categories_json);
create index on public.draftable_entities (normalized_name);

create policy "entities_member_read" on public.draftable_entities
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "entities_admin_write" on public.draftable_entities
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "entities_service_all" on public.draftable_entities
  for all using (auth.role() = 'service_role');

-- ============================================================
-- DRAFT SEGMENTS
-- ============================================================
create table public.draft_segments (
  id                  uuid primary key default uuid_generate_v4(),
  league_id           uuid not null references public.leagues(id) on delete cascade,
  category            text not null check (category in ('heisman','cfp','cinderella','conference_champion')),
  segment_order       integer not null,
  pick_count_per_player integer not null default 4,
  status              text not null default 'pending' check (status in ('pending','active','completed')),
  unique(league_id, category)
);

alter table public.draft_segments enable row level security;

create policy "segments_member_read" on public.draft_segments
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "segments_admin_write" on public.draft_segments
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "segments_service_all" on public.draft_segments
  for all using (auth.role() = 'service_role');

-- ============================================================
-- DRAFT PICKS
-- ============================================================
create table public.draft_picks (
  id                   uuid primary key default uuid_generate_v4(),
  league_id            uuid not null references public.leagues(id) on delete cascade,
  draft_segment_id     uuid not null references public.draft_segments(id),
  round_number         integer not null,
  overall_pick_number  integer not null,
  player_user_id       uuid not null references public.users(id),
  draftable_entity_id  uuid not null references public.draftable_entities(id),
  category             text not null check (category in ('heisman','cfp','cinderella','conference_champion')),
  locked_odds          integer,
  pick_timestamp       timestamptz not null default now(),
  admin_override       boolean not null default false,
  override_reason      text,
  unique(league_id, overall_pick_number)
);

alter table public.draft_picks enable row level security;

create index on public.draft_picks (league_id);
create index on public.draft_picks (player_user_id);
create index on public.draft_picks (draftable_entity_id);

create policy "picks_member_read" on public.draft_picks
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "picks_service_all" on public.draft_picks
  for all using (auth.role() = 'service_role');

-- ============================================================
-- DRAFT STATE
-- ============================================================
create table public.draft_state (
  id                        uuid primary key default uuid_generate_v4(),
  league_id                 uuid not null unique references public.leagues(id) on delete cascade,
  status                    text not null default 'not_started' check (status in (
    'not_started','active','paused','completed'
  )),
  current_segment_id        uuid references public.draft_segments(id),
  current_overall_pick_number integer not null default 1,
  current_player_user_id    uuid references public.users(id),
  paused                    boolean not null default false,
  timer_seconds_remaining   integer,
  updated_at                timestamptz not null default now()
);

alter table public.draft_state enable row level security;

create policy "draft_state_member_read" on public.draft_state
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "draft_state_service_all" on public.draft_state
  for all using (auth.role() = 'service_role');

-- ============================================================
-- SCORING CONFIGS
-- ============================================================
create table public.scoring_configs (
  id         uuid primary key default uuid_generate_v4(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  category   text not null check (category in ('heisman','cfp','cinderella','conference_champion')),
  config_json jsonb not null,
  locked     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(league_id, category)
);

alter table public.scoring_configs enable row level security;

create policy "scoring_configs_member_read" on public.scoring_configs
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "scoring_configs_admin_write" on public.scoring_configs
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "scoring_configs_service_all" on public.scoring_configs
  for all using (auth.role() = 'service_role');

-- ============================================================
-- RESULT IMPORTS
-- ============================================================
create table public.result_imports (
  id          uuid primary key default uuid_generate_v4(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  result_type text not null check (result_type in ('heisman','cfp','cinderella','conference_champion')),
  file_name   text not null,
  status      text not null default 'pending' check (status in ('pending','reviewing','approved','published')),
  raw_rows_json jsonb not null default '[]',
  created_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now()
);

alter table public.result_imports enable row level security;

create policy "result_imports_admin_all" on public.result_imports
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "result_imports_service_all" on public.result_imports
  for all using (auth.role() = 'service_role');

-- ============================================================
-- RESULT ROWS
-- ============================================================
create table public.result_rows (
  id                   uuid primary key default uuid_generate_v4(),
  result_import_id     uuid not null references public.result_imports(id) on delete cascade,
  league_id            uuid not null references public.leagues(id) on delete cascade,
  matched_entity_id    uuid references public.draftable_entities(id),
  raw_row_json         jsonb not null,
  normalized_values_json jsonb not null default '{}',
  outcome              text,
  match_status         text not null default 'unmatched' check (match_status in (
    'auto','fuzzy','manual','unmatched'
  )),
  admin_notes          text
);

alter table public.result_rows enable row level security;

create policy "result_rows_admin_all" on public.result_rows
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "result_rows_service_all" on public.result_rows
  for all using (auth.role() = 'service_role');

-- ============================================================
-- SCORES
-- ============================================================
create table public.scores (
  id              uuid primary key default uuid_generate_v4(),
  league_id       uuid not null references public.leagues(id) on delete cascade,
  draft_pick_id   uuid not null unique references public.draft_picks(id) on delete cascade,
  category        text not null check (category in ('heisman','cfp','cinderella','conference_champion')),
  outcome         text,
  points          numeric not null default 0,
  calculation_json jsonb not null default '{}',
  published       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.scores enable row level security;

create index on public.scores (league_id);
create index on public.scores (draft_pick_id);

create policy "scores_member_read_published" on public.scores
  for select using (
    published = true
    and exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "scores_member_read_provisional" on public.scores
  for select using (
    exists (
      select 1 from public.leagues l
      join public.league_members lm on lm.league_id = l.id
      where l.id = league_id
        and lm.user_id = auth.uid()
        and (l.settings_json->>'allow_provisional_visibility')::boolean = true
    )
  );

create policy "scores_admin_all" on public.scores
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "scores_service_all" on public.scores
  for all using (auth.role() = 'service_role');

-- ============================================================
-- TRASH TALK POSTS
-- ============================================================
create table public.trash_talk_posts (
  id         uuid primary key default uuid_generate_v4(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references public.users(id),
  body       text not null check (length(body) <= 500),
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trash_talk_posts enable row level security;

create index on public.trash_talk_posts (league_id, created_at desc);

create policy "trash_talk_member_read" on public.trash_talk_posts
  for select using (
    deleted = false
    and exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "trash_talk_own_insert" on public.trash_talk_posts
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.league_members lm
      where lm.league_id = league_id and lm.user_id = auth.uid()
    )
  );

create policy "trash_talk_own_delete" on public.trash_talk_posts
  for update using (user_id = auth.uid());

create policy "trash_talk_admin_all" on public.trash_talk_posts
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "trash_talk_service_all" on public.trash_talk_posts
  for all using (auth.role() = 'service_role');

-- ============================================================
-- AUDIT LOGS
-- ============================================================
create table public.audit_logs (
  id             uuid primary key default uuid_generate_v4(),
  league_id      uuid references public.leagues(id) on delete set null,
  actor_user_id  uuid not null references public.users(id),
  action         text not null,
  entity_type    text not null,
  entity_id      text not null,
  before_json    jsonb,
  after_json     jsonb,
  created_at     timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index on public.audit_logs (league_id, created_at desc);

create policy "audit_logs_admin_read" on public.audit_logs
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "audit_logs_service_all" on public.audit_logs
  for all using (auth.role() = 'service_role');

-- ============================================================
-- REALTIME — enable for draft-sensitive tables
-- ============================================================
alter publication supabase_realtime add table public.draft_state;
alter publication supabase_realtime add table public.draft_picks;
alter publication supabase_realtime add table public.trash_talk_posts;

-- ============================================================
-- UPDATED_AT trigger
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leagues_updated_at before update on public.leagues
  for each row execute function update_updated_at();
create trigger scoring_configs_updated_at before update on public.scoring_configs
  for each row execute function update_updated_at();
create trigger scores_updated_at before update on public.scores
  for each row execute function update_updated_at();
create trigger trash_talk_updated_at before update on public.trash_talk_posts
  for each row execute function update_updated_at();
create trigger draft_state_updated_at before update on public.draft_state
  for each row execute function update_updated_at();


-- ============================================================
-- 002_seed_data.sql — 2025 archive + 2026 sample leagues
-- ============================================================
-- CFB War Chest 2026 — Seed Data (Migration 002)
-- Seeds:
--   1. Bootstrap admin user (created via API; here we ensure the profile)
--   2. 2025 Archive League (read-only, real picks/results/scores)
--   3. 2026 Sample League (status=setup, fictional players, for testing)
--
-- NOTE: This migration is safe to run multiple times (uses INSERT...ON CONFLICT DO NOTHING)
-- Real player IDs use placeholder UUIDs — the bootstrap script will link real auth users.

-- ── Helper constants ──────────────────────────────────────────────────────────
-- These UUIDs are stable seeds; they'll be replaced by real auth user IDs when players log in.
-- Admin is created via /api/auth/bootstrap from BOOTSTRAP_ADMIN_EMAIL env var.

-- 2025 Archive League: real players and results from PRD Section 9.1
-- Players: Darren Steadman, Mike Wade, Michael Steadman, Mark Franzen
-- Final scores: 5,300 / 3,986.4 / 2,200 / 2,009.1

-- We insert a league with is_archive=true so it shows as read-only in the UI.
-- All player accounts use placeholder UUIDs; when real players log in their accounts
-- are linked via the invite flow. For the seed to work standalone, we insert
-- synthetic user rows and skip foreign-key collisions.

do $$
declare
  admin_user_id  uuid;
  archive_id     uuid := 'a2025000-0000-0000-0000-000000000001';
  sample_id      uuid := 'b2026000-0000-0000-0000-000000000001';

  -- 2025 player placeholder IDs
  p_darren  uuid := 'c0000001-0000-0000-0000-000000000001';
  p_mike    uuid := 'c0000002-0000-0000-0000-000000000001';
  p_michael uuid := 'c0000003-0000-0000-0000-000000000001';
  p_mark    uuid := 'c0000004-0000-0000-0000-000000000001';

  -- 2026 sample player placeholder IDs
  s1 uuid := 'd0000001-0000-0000-0000-000000000001';
  s2 uuid := 'd0000002-0000-0000-0000-000000000001';
  s3 uuid := 'd0000003-0000-0000-0000-000000000001';
  s4 uuid := 'd0000004-0000-0000-0000-000000000001';
  s5 uuid := 'd0000005-0000-0000-0000-000000000001';
  s6 uuid := 'd0000006-0000-0000-0000-000000000001';
begin

  -- ── Get or detect admin ─────────────────────────────────────────────────────
  select id into admin_user_id from public.users where role = 'admin' limit 1;

  if admin_user_id is null then
    -- Create a placeholder admin for seed purposes; replaced by bootstrap
    admin_user_id := 'a0000000-0000-0000-0000-000000000001'::uuid;
    insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role)
      values (admin_user_id, 'seed-admin@cfbwarchest.local', '{}', now(), now(), 'authenticated', 'authenticated')
      on conflict (id) do nothing;
    insert into public.users (id, email, display_name, role)
      values (admin_user_id, 'seed-admin@cfbwarchest.local', 'Commissioner', 'admin')
      on conflict (id) do nothing;
  end if;

  -- ── Placeholder users for archive players ────────────────────────────────────
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role) values
    (p_darren,  'darren.steadman@seed.local',  '{}', now(), now(), 'authenticated', 'authenticated'),
    (p_mike,    'mike.wade@seed.local',         '{}', now(), now(), 'authenticated', 'authenticated'),
    (p_michael, 'michael.steadman@seed.local',  '{}', now(), now(), 'authenticated', 'authenticated'),
    (p_mark,    'mark.franzen@seed.local',       '{}', now(), now(), 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.users (id, email, display_name, role) values
    (p_darren,  'darren.steadman@seed.local',  'Darren Steadman',  'player'),
    (p_mike,    'mike.wade@seed.local',         'Mike Wade',         'player'),
    (p_michael, 'michael.steadman@seed.local',  'Michael Steadman',  'player'),
    (p_mark,    'mark.franzen@seed.local',       'Mark Franzen',       'player')
  on conflict (id) do nothing;

  -- ── Placeholder users for 2026 sample players ────────────────────────────────
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role) values
    (s1, 'player1@sample.local', '{}', now(), now(), 'authenticated', 'authenticated'),
    (s2, 'player2@sample.local', '{}', now(), now(), 'authenticated', 'authenticated'),
    (s3, 'player3@sample.local', '{}', now(), now(), 'authenticated', 'authenticated'),
    (s4, 'player4@sample.local', '{}', now(), now(), 'authenticated', 'authenticated'),
    (s5, 'player5@sample.local', '{}', now(), now(), 'authenticated', 'authenticated'),
    (s6, 'player6@sample.local', '{}', now(), now(), 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.users (id, email, display_name, role) values
    (s1, 'player1@sample.local', 'Alpha Wolf',    'player'),
    (s2, 'player2@sample.local', 'Beta Brawler',  'player'),
    (s3, 'player3@sample.local', 'Gamma Grinder', 'player'),
    (s4, 'player4@sample.local', 'Delta Dominator', 'player'),
    (s5, 'player5@sample.local', 'Epsilon Eagle', 'player'),
    (s6, 'player6@sample.local', 'Zeta Zealot',   'player')
  on conflict (id) do nothing;

  -- ── 2025 Archive League ─────────────────────────────────────────────────────
  insert into public.leagues (id, name, season_year, status, settings_json, created_by) values (
    archive_id,
    'War Chest 2025 (Archive)',
    2025,
    'completed',
    '{
      "max_players": 4,
      "conferences": ["SEC","Big Ten","Big 12","ACC"],
      "pick_counts": {"heisman":4,"cfp":4,"cinderella":4,"conference_champion":12},
      "cinderella_ap_threshold": 25,
      "draft_timer_enabled": false,
      "draft_timer_seconds": 90,
      "draft_timer_on_expiry": "pause",
      "draft_segment_order": ["heisman","cfp","cinderella","conference_champion"],
      "trash_talk_enabled": false,
      "allow_provisional_visibility": false,
      "is_archive": true
    }'::jsonb,
    admin_user_id
  ) on conflict (id) do nothing;

  insert into public.league_members (league_id, user_id, display_name, role_in_league, draft_position, invite_status) values
    (archive_id, admin_user_id, 'Commissioner',    'admin',   null, 'accepted'),
    (archive_id, p_darren,  'Darren Steadman',  'player',  1,    'accepted'),
    (archive_id, p_mike,    'Mike Wade',         'player',  2,    'accepted'),
    (archive_id, p_michael, 'Michael Steadman',  'player',  3,    'accepted'),
    (archive_id, p_mark,    'Mark Franzen',       'player',  4,    'accepted')
  on conflict (league_id, user_id) do nothing;

  -- Archive scoring configs (2025 defaults)
  insert into public.scoring_configs (league_id, category, config_json, locked) values
    (archive_id, 'heisman',           '{"formula":"multiplier_odds_ratio","outcomes":{"winner":{"multiplier":350},"finalist_non_winner":{"multiplier":100},"no_score":{"multiplier":0}}}'::jsonb, true),
    (archive_id, 'cfp',               '{"formula":"multiplier_odds_ratio","outcomes":{"wins_national_title":{"multiplier":300},"loses_final":{"multiplier":200},"loses_semifinal":{"multiplier":100},"makes_playoff_no_semifinal":{"multiplier":20},"misses_playoff":{"multiplier":0}}}'::jsonb, true),
    (archive_id, 'cinderella',        '{"formula":"fixed_points","outcomes":{"top_10":{"points":150},"rank_11_20":{"points":75},"rank_21_25":{"points":40},"unranked":{"points":0}}}'::jsonb, true),
    (archive_id, 'conference_champion','{"formula":"multiplier_odds_ratio","outcomes":{"wins_conference_title_game":{"multiplier":150},"loses_conference_title_game":{"multiplier":75},"fails_to_qualify":{"multiplier":0}}}'::jsonb, true)
  on conflict (league_id, category) do nothing;

  -- ── 2026 Sample League ──────────────────────────────────────────────────────
  insert into public.leagues (id, name, season_year, status, settings_json, created_by) values (
    sample_id,
    'War Chest 2026 (Sample)',
    2026,
    'setup',
    '{
      "max_players": 6,
      "conferences": ["SEC","Big Ten","Big 12","ACC"],
      "pick_counts": {"heisman":4,"cfp":4,"cinderella":4,"conference_champion":12},
      "cinderella_ap_threshold": 25,
      "draft_timer_enabled": false,
      "draft_timer_seconds": 90,
      "draft_timer_on_expiry": "pause",
      "draft_segment_order": ["heisman","cfp","cinderella","conference_champion"],
      "trash_talk_enabled": true,
      "allow_provisional_visibility": false,
      "is_archive": false
    }'::jsonb,
    admin_user_id
  ) on conflict (id) do nothing;

  insert into public.league_members (league_id, user_id, display_name, role_in_league, invite_status) values
    (sample_id, admin_user_id, 'Commissioner',    'admin',  'accepted'),
    (sample_id, s1, 'Alpha Wolf',    'player', 'accepted'),
    (sample_id, s2, 'Beta Brawler',  'player', 'accepted'),
    (sample_id, s3, 'Gamma Grinder', 'player', 'accepted'),
    (sample_id, s4, 'Delta Dominator', 'player', 'accepted'),
    (sample_id, s5, 'Epsilon Eagle', 'player', 'accepted'),
    (sample_id, s6, 'Zeta Zealot',   'player', 'accepted')
  on conflict (league_id, user_id) do nothing;

  insert into public.scoring_configs (league_id, category, config_json, locked) values
    (sample_id, 'heisman',           '{"formula":"multiplier_odds_ratio","outcomes":{"winner":{"multiplier":350},"finalist_non_winner":{"multiplier":100},"no_score":{"multiplier":0}}}'::jsonb, false),
    (sample_id, 'cfp',               '{"formula":"multiplier_odds_ratio","outcomes":{"wins_national_title":{"multiplier":300},"loses_final":{"multiplier":200},"loses_semifinal":{"multiplier":100},"makes_playoff_no_semifinal":{"multiplier":20},"misses_playoff":{"multiplier":0}}}'::jsonb, false),
    (sample_id, 'cinderella',        '{"formula":"fixed_points","outcomes":{"top_10":{"points":150},"rank_11_20":{"points":75},"rank_21_25":{"points":40},"unranked":{"points":0}}}'::jsonb, false),
    (sample_id, 'conference_champion','{"formula":"multiplier_odds_ratio","outcomes":{"wins_conference_title_game":{"multiplier":150},"loses_conference_title_game":{"multiplier":75},"fails_to_qualify":{"multiplier":0}}}'::jsonb, false)
  on conflict (league_id, category) do nothing;

  insert into public.draft_segments (league_id, category, segment_order, pick_count_per_player, status) values
    (sample_id, 'heisman',            0, 4,  'pending'),
    (sample_id, 'cfp',                1, 4,  'pending'),
    (sample_id, 'cinderella',         2, 4,  'pending'),
    (sample_id, 'conference_champion',3, 12, 'pending')
  on conflict (league_id, category) do nothing;

  insert into public.draft_state (league_id, status, current_overall_pick_number) values
    (sample_id, 'not_started', 1)
  on conflict (league_id) do nothing;

end;
$$;


-- ============================================================
-- 003_add_new_categories.sql — most_improved + disaster_draft
-- ============================================================
-- CFP War Chest 2026 — New Categories (Migration 003)
--
-- Adds the two 2026 categories introduced in the PRD/GDD:
--   • most_improved  — regular-season wins above the locked preseason win total
--   • disaster_draft — inverted record (losses help, wins hurt, winless bonus)
--
-- Also:
--   • widens every category CHECK constraint to accept the new values
--   • adds a first-class preseason_win_total column to draftable_entities
--     (Most Improved baseline; TDD §5 prefers stable fields as columns)
--   • refreshes the 2026 sample league to the new 5-category default set
--     (Conference Champion disabled for 2026, retained for the 2025 archive)
--
-- Historical integrity: the 2025 archive league is untouched — its four original
-- categories (including conference_champion) remain valid and reproducible.

-- ── Widen category CHECK constraints ─────────────────────────────────────────
-- Postgres auto-names these <table>_<column>_check. Drop-if-exists then re-add.

alter table public.draft_segments
  drop constraint if exists draft_segments_category_check,
  add constraint draft_segments_category_check check (category in (
    'heisman','cfp','cinderella','conference_champion','most_improved','disaster_draft'
  ));

alter table public.draft_picks
  drop constraint if exists draft_picks_category_check,
  add constraint draft_picks_category_check check (category in (
    'heisman','cfp','cinderella','conference_champion','most_improved','disaster_draft'
  ));

alter table public.scoring_configs
  drop constraint if exists scoring_configs_category_check,
  add constraint scoring_configs_category_check check (category in (
    'heisman','cfp','cinderella','conference_champion','most_improved','disaster_draft'
  ));

alter table public.scores
  drop constraint if exists scores_category_check,
  add constraint scores_category_check check (category in (
    'heisman','cfp','cinderella','conference_champion','most_improved','disaster_draft'
  ));

alter table public.result_imports
  drop constraint if exists result_imports_result_type_check,
  add constraint result_imports_result_type_check check (result_type in (
    'heisman','cfp','cinderella','conference_champion','most_improved','disaster_draft'
  ));

-- ── Most Improved baseline column ────────────────────────────────────────────
-- Locked preseason regular-season win total (over/under line). Nullable because
-- only Most Improved entities carry it; may be a half-win (e.g. 5.5).
alter table public.draftable_entities
  add column if not exists preseason_win_total numeric;

-- ── Refresh the 2026 sample league to the new default category set ───────────
-- Guarded to the sample league id so it no-ops on any other environment.
do $$
declare
  sample_id uuid := 'b2026000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from public.leagues where id = sample_id) then

    -- Update settings: new pick counts + draft order, drop conference_champion.
    update public.leagues
    set settings_json = settings_json
      || jsonb_build_object(
           'pick_counts', jsonb_build_object(
             'heisman', 3, 'cfp', 4, 'cinderella', 4,
             'most_improved', 2, 'disaster_draft', 2
           ),
           'draft_segment_order', jsonb_build_array(
             'heisman', 'cfp', 'cinderella', 'most_improved', 'disaster_draft'
           )
         )
    where id = sample_id;

    -- Remove Conference Champion from the 2026 sample (retained in 2025 archive).
    delete from public.scoring_configs
      where league_id = sample_id and category = 'conference_champion';
    delete from public.draft_segments
      where league_id = sample_id and category = 'conference_champion';

    -- Seed the two new categories' scoring configs.
    insert into public.scoring_configs (league_id, category, config_json, locked) values
      (sample_id, 'most_improved',
        '{"formula":"wins_over_baseline","points_per_win":25,"floor":0,"cap":250}'::jsonb, false),
      (sample_id, 'disaster_draft',
        '{"formula":"inverted_record","points_per_loss":20,"points_per_win":-20,"winless_bonus":200,"floor":0,"cap":null}'::jsonb, false)
    on conflict (league_id, category) do nothing;

    -- Seed the two new categories' draft segments.
    insert into public.draft_segments (league_id, category, segment_order, pick_count_per_player, status) values
      (sample_id, 'most_improved',  3, 2, 'pending'),
      (sample_id, 'disaster_draft', 4, 2, 'pending')
    on conflict (league_id, category) do nothing;

  end if;
end;
$$;
