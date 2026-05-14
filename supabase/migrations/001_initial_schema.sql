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
