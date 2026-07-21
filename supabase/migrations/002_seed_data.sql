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
