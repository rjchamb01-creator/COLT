-- Talyn — Training Content Engine
-- Adds the pipeline that lets the free Training Library grow and feel like a
-- continuous stream, and lays the groundwork for the Phase-2 paid AI Program
-- Recommender. Three pieces:
--
--   1. A skill/goal TAXONOMY on drills — a `skills` lookup table + a
--      `drill_skills` join. Drills were tagged only by sport + age group; now
--      they can carry skills (acceleration, first_touch, defence, …) so content
--      can be browsed, filtered, AI-drafted, and (later) sequenced by goal.
--   2. A `difficulty` band on drills (1–3) for future progression/sequencing.
--   3. Weekly Matchday Set AUTO-ROTATION — rotate_weekly_sets() builds a fresh
--      global Set per cohort each week (idempotent), scheduled via pg_cron.
--
-- RLS follows the established club-scoped, role-gated pattern (see drills/
-- programs migrations). drill_skills.club_id is denormalised from the drill
-- (NULL = global) so the standard pattern applies without a join — mirrors
-- program_drills. current_club_id()/current_role() are existing SECURITY DEFINER
-- helpers.

-- ---------------------------------------------------------------------------
-- 1. Taxonomy — skills lookup + drill_skills join
-- ---------------------------------------------------------------------------

-- A growing vocabulary of trainable skills/goals. `key` is the stable machine
-- key (used by the AI-draft tool + URL filters); `label` is the UI string.
-- sport NULL = applies to both MVP sports; non-null = sport-specific skill.
create table public.skills (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  sport      public.sport,
  created_at timestamptz not null default now()
);

create index skills_sport_idx on public.skills (sport);

-- The drill ↔ skill join. club_id is denormalised from the drill (NULL = global
-- content) so the standard club-scoped RLS applies without joining drills.
create table public.drill_skills (
  id        uuid primary key default gen_random_uuid(),
  drill_id  uuid not null references public.drills (id) on delete cascade,
  skill_id  uuid not null references public.skills (id) on delete cascade,
  club_id   uuid references public.clubs (id) on delete cascade,
  unique (drill_id, skill_id)
);

create index drill_skills_drill_idx on public.drill_skills (drill_id);
create index drill_skills_skill_idx on public.drill_skills (skill_id);

-- ---------------------------------------------------------------------------
-- 2. difficulty band on drills (1 = intro, 2 = building, 3 = advanced).
--    Nullable — existing/seed drills stay unset; useful to the recommender.
-- ---------------------------------------------------------------------------

alter table public.drills
  add column difficulty smallint check (difficulty between 1 and 3);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.skills       enable row level security;
alter table public.drill_skills enable row level security;

-- skills: a shared platform vocabulary — readable by any authenticated user;
-- writes are platform-admin only (it's a curated lookup, not club content).
create policy skills_select on public.skills
  for select using (auth.uid() is not null);

create policy skills_insert on public.skills
  for insert with check (public.current_role() = 'admin');

create policy skills_update on public.skills
  for update using (public.current_role() = 'admin');

-- drill_skills: SELECT follows drill visibility (global, own club, or admin) via
-- the denormalised club_id; writes follow the drills insert/update gate so a
-- coach/club_admin can only tag their own club's drills and global tags are
-- admin/seed-only.
create policy drill_skills_select on public.drill_skills
  for select using (
    club_id is null
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

create policy drill_skills_insert on public.drill_skills
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and (
      club_id = public.current_club_id()
      or (club_id is null and public.current_role() = 'admin')
    )
  );

create policy drill_skills_delete on public.drill_skills
  for delete using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Seed the starter skill vocabulary. Most skills apply to both sports (sport
-- NULL); first_touch is soccer-specific and ball_handling rugby-specific, to
-- exercise the nullable sport column and let the authoring UI offer the right
-- skills per sport.
-- ---------------------------------------------------------------------------

insert into public.skills (key, label, sport)
values
  ('acceleration',    'Acceleration',    null),
  ('agility',         'Agility',         null),
  ('passing',         'Passing',         null),
  ('finishing',       'Finishing',       null),
  ('defence',         'Defence',         null),
  ('fitness',         'Fitness',         null),
  ('decision_making', 'Decision Making', null),
  ('first_touch',     'First Touch',     'soccer'),
  ('ball_handling',   'Ball Handling',   'rugby_league')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed drill_skills for the existing global library so skill tags + filtering
-- and the recommender groundwork work immediately (no manual tagging needed).
-- Joined by drill title (global drills only) + skill key. on conflict no-ops so
-- this is safe to re-run. Soccer drills never get the rugby ball_handling tag
-- and vice-versa, matching the sport-specific skills above.
-- ---------------------------------------------------------------------------

insert into public.drill_skills (drill_id, skill_id, club_id)
select d.id, s.id, null
from (values
  -- Rugby League
  ('Ball Handling Basics',        'ball_handling'),
  ('Ball Handling Basics',        'passing'),
  ('Defensive Line Speed',        'defence'),
  ('Defensive Line Speed',        'agility'),
  ('Offload Under Pressure',      'ball_handling'),
  ('Offload Under Pressure',      'decision_making'),
  ('Play-the-Ball Tempo',         'ball_handling'),
  ('Play-the-Ball Tempo',         'fitness'),
  ('Two-Hand Pickup',             'ball_handling'),
  ('Two-Hand Pickup',             'acceleration'),
  ('Tag and Reset',               'agility'),
  ('Tag and Reset',               'decision_making'),
  ('Dummy-Half Service',          'passing'),
  ('Dummy-Half Service',          'ball_handling'),
  ('Kick-Chase Pursuit',          'defence'),
  ('Kick-Chase Pursuit',          'fitness'),
  ('Edge Defence Reads',          'defence'),
  ('Edge Defence Reads',          'decision_making'),
  ('Yardage Carry and Quick PTB', 'ball_handling'),
  ('Yardage Carry and Quick PTB', 'fitness'),
  -- Soccer
  ('Dribbling Through Cones',     'agility'),
  ('Dribbling Through Cones',     'first_touch'),
  ('Passing Triangles',           'passing'),
  ('Passing Triangles',           'first_touch'),
  ('Finishing From Crosses',      'finishing'),
  ('Finishing From Crosses',      'decision_making'),
  ('Shielding the Ball',          'first_touch'),
  ('Shielding the Ball',          'decision_making'),
  ('Sole-Roll Turns',             'first_touch'),
  ('Sole-Roll Turns',             'agility'),
  ('Inside-Outside Touches',      'first_touch'),
  ('Inside-Outside Touches',      'agility'),
  ('Receive and Turn',            'first_touch'),
  ('Receive and Turn',            'decision_making'),
  ('1v1 Attacking the Defender',  'agility'),
  ('1v1 Attacking the Defender',  'decision_making'),
  ('Pressing Triggers',           'defence'),
  ('Pressing Triggers',           'decision_making'),
  ('Switching Play',              'passing'),
  ('Switching Play',              'decision_making')
) as x(title, skill_key)
join public.drills d on d.title = x.title and d.club_id is null
join public.skills s on s.key = x.skill_key
on conflict (drill_id, skill_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Weekly Matchday Set auto-rotation
--
-- rotate_weekly_sets() builds a fresh GLOBAL Set for the current week for every
-- cohort (sport × age_group) that has at least 2 global drills and doesn't yet
-- have a live global Set this week. Drill selection rotates week-to-week via a
-- deterministic hash of (week, drill id), so the Set feels fresh without any
-- stored "last featured" state. Returns the number of cohorts a Set was created
-- for. IDEMPOTENT: the "no live global Set yet" guard means re-running (or a
-- duplicate cron fire) never double-creates a Set for a cohort/week.
--
-- SECURITY DEFINER so it can write global content across RLS. It authorises the
-- caller itself: platform admins (the "rotate now" button) and the unattended
-- pg_cron context (auth.uid() IS NULL) are allowed; anyone else is refused.
-- ---------------------------------------------------------------------------

create or replace function public.rotate_weekly_sets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_week        date := date_trunc('week', current_date)::date;
  v_cohort      record;
  v_prog_id     uuid;
  v_created     integer := 0;
  v_sport_label text;
begin
  -- Authorisation: allow the unattended cron context (no JWT → auth.uid() null)
  -- and platform admins; refuse everyone else. EXECUTE is granted to
  -- authenticated only, so anon can't reach this at all.
  if v_uid is not null and public.current_role() is distinct from 'admin' then
    raise exception 'Only platform admins can rotate weekly Sets';
  end if;

  for v_cohort in
    select d.sport, d.age_group
    from public.drills d
    where d.club_id is null
    group by d.sport, d.age_group
    having count(*) >= 2
  loop
    -- Idempotency guard: skip cohorts that already have a live global Set
    -- this week (manual seed or a previous rotation).
    if exists (
      select 1 from public.programs p
      where p.club_id is null
        and p.sport = v_cohort.sport
        and p.age_group = v_cohort.age_group
        and p.week_start = v_week
    ) then
      continue;
    end if;

    v_sport_label := case v_cohort.sport
      when 'rugby_league' then 'Rugby League'
      when 'soccer'       then 'Soccer'
      else v_cohort.sport::text
    end;

    insert into public.programs (club_id, sport, age_group, title, description, week_start)
    values (
      null, v_cohort.sport, v_cohort.age_group,
      'This Week''s Set',
      'A fresh ' || v_sport_label || ' Set — bank every drill this week to complete the Set and keep your Heat alive.',
      v_week
    )
    returning id into v_prog_id;

    -- Pick up to 3 global drills for the cohort, rotating selection week-to-week
    -- via a hash of (week, drill id). row_number() over the same hash order
    -- assigns 1..N; the outer limit keeps the first 3, so positions are 1,2,3.
    insert into public.program_drills (program_id, drill_id, position, club_id)
    select v_prog_id,
           d.id,
           row_number() over (order by md5(v_week::text || d.id::text)),
           null
    from public.drills d
    where d.club_id is null
      and d.sport = v_cohort.sport
      and d.age_group = v_cohort.age_group
    order by md5(v_week::text || d.id::text)
    limit 3;

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- Lock execution down to authenticated callers (the function self-authorises to
-- admins) plus the unattended cron context (pg_cron runs as the function owner,
-- which always retains EXECUTE). Postgres grants EXECUTE to PUBLIC by default, so
-- a plain grant isn't enough — without the revoke, an ANONYMOUS caller could run
-- this and, since auth.uid() is null for anon, slip past the admin guard as if it
-- were the cron context. Revoke from public + anon explicitly (same defensive
-- pattern as athlete_heat in the gamification migration).
revoke execute on function public.rotate_weekly_sets() from public, anon;
grant execute on function public.rotate_weekly_sets() to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule it weekly (Mondays 00:05 UTC) via pg_cron. Wrapped so the migration
-- still applies cleanly if pg_cron isn't enabled yet — on hosted Supabase you
-- enable pg_cron under Database → Extensions, then re-run just the cron.schedule
-- call below. The admin "Rotate now" button calls rotate_weekly_sets() directly
-- and does NOT depend on pg_cron, so rotation is testable immediately.
-- cron.schedule upserts by job name, so this is safe to re-run.
-- ---------------------------------------------------------------------------

do $cron$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'rotate-weekly-sets',
    '5 0 * * 1',
    'select public.rotate_weekly_sets();'
  );
exception when others then
  raise notice 'pg_cron not scheduled (%). Enable the pg_cron extension in the Supabase dashboard, then run: select cron.schedule(''rotate-weekly-sets'', ''5 0 * * 1'', ''select public.rotate_weekly_sets();'');', sqlerrm;
end;
$cron$;
