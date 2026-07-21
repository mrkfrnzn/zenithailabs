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
