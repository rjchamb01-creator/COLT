-- Talyn — Matchday Challenge (Weekly Programs), a.k.a. "the Set"
-- The weekly "keep showing up" mechanic that completes the engagement loop: each
-- week a fresh Set of drills is live for a cohort (sport + age group). Finish the
-- whole Set inside its week and you bank bonus XP — keeping your Heat alive.
--
--   programs            one weekly Matchday Challenge targeted at a cohort.
--   program_drills      the ordered Set — which drills make up the challenge.
--   program_completions append-only ledger: one row the first time an athlete
--                       finishes a Set (drives the bonus + the "Set complete" UI).
--
-- Tenancy mirrors drills/caps: club_id NULL = platform/global content visible to
-- every club; non-null = club-specific. RLS follows the established club-scoped,
-- role-gated pattern. The completion ledger is written ONLY by the complete_drill
-- SECURITY DEFINER RPC (no client INSERT policy) so it stays authoritative.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A weekly Matchday Challenge. week_start is the Monday of the week it is live;
-- detection (in complete_drill) and the UI both key off date_trunc('week', ...).
create table public.programs (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs (id) on delete cascade,
  sport       public.sport not null,
  age_group   public.age_group not null,
  title       text not null,
  description text not null,
  week_start  date not null,
  created_at  timestamptz not null default now()
);

create index programs_club_id_idx    on public.programs (club_id);
create index programs_week_start_idx on public.programs (week_start);
create index programs_cohort_idx     on public.programs (sport, age_group, week_start);

-- The ordered Set: which drills make up a program. club_id is denormalised from
-- the program so the standard RLS pattern applies without a join.
create table public.program_drills (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  drill_id   uuid not null references public.drills (id) on delete cascade,
  position   integer not null default 0,
  club_id    uuid references public.clubs (id) on delete cascade,
  unique (program_id, drill_id)
);

create index program_drills_program_idx on public.program_drills (program_id);
create index program_drills_drill_idx   on public.program_drills (drill_id);

-- Append-only completion ledger: one row the first time an athlete finishes a Set.
create table public.program_completions (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes (id) on delete cascade,
  club_id      uuid not null references public.clubs (id) on delete cascade,
  program_id   uuid not null references public.programs (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (athlete_id, program_id)
);

create index program_completions_athlete_idx on public.program_completions (athlete_id);
create index program_completions_club_idx    on public.program_completions (club_id);

-- ---------------------------------------------------------------------------
-- complete_drill — EXTENDED. After logging the drill's XP and granting caps (the
-- gamification behaviour, unchanged), detect whether this drill belongs to a
-- Matchday Challenge that is (a) visible to the athlete's club, (b) targets the
-- athlete's sport + age group, (c) is live for the current week, and whether ALL
-- of that Set's drills now have a qualifying drill XP event for this athlete
-- within the program's week (created_at >= week_start). If the Set is complete
-- and not already banked, record a completion + a bonus XP grant (source='bonus')
-- and report it back so the UI can celebrate. Returns the full summary jsonb.
-- ---------------------------------------------------------------------------

create or replace function public.complete_drill(p_athlete_id uuid, p_drill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_caller_club   uuid;
  v_caller_role   public.user_role;
  v_athlete       public.athletes;
  v_drill         public.drills;
  v_gain          integer;
  v_total_before  integer;
  v_total_after   integer;
  v_tier_before   text;
  v_tier_after    text;
  v_drill_count   integer;
  v_heat          integer;
  v_new_caps      jsonb := '[]'::jsonb;
  v_cap           record;
  v_qualifies     boolean;
  -- Matchday Challenge (the Set) detection.
  v_week_start    date := date_trunc('week', current_date)::date;
  v_set_completed boolean := false;
  v_set_bonus     integer := 0;
  v_prog          record;
  v_required      integer;
  v_done          integer;
  v_set_bonus_xp  constant integer := 50;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select club_id, role into v_caller_club, v_caller_role
  from public.profiles where id = v_uid;

  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Athlete not found';
  end if;

  -- Authorisation mirrors the athletes_update policy: a coach/club_admin in the
  -- club, the managing parent, the athlete themselves, or a platform admin.
  if not (
    v_caller_role = 'admin'
    or (
      v_athlete.club_id = v_caller_club
      and (
        v_caller_role in ('coach', 'club_admin')
        or v_athlete.parent_id = v_uid
      )
    )
  ) then
    raise exception 'Not allowed to log sessions for this athlete';
  end if;

  -- Drill must be global or belong to the athlete's club.
  select * into v_drill from public.drills
  where id = p_drill_id
    and (club_id is null or club_id = v_athlete.club_id);
  if not found then
    raise exception 'Drill not found';
  end if;

  v_gain := v_drill.duration_min; -- XP earned = minutes trained.

  select coalesce(sum(xp), 0) into v_total_before
  from public.xp_events where athlete_id = p_athlete_id;
  v_tier_before := public.tier_for_xp(v_total_before);

  -- Record the session.
  insert into public.xp_events (athlete_id, club_id, source, drill_id, xp, note)
  values (p_athlete_id, v_athlete.club_id, 'drill', p_drill_id, v_gain, v_drill.title);

  v_total_after := v_total_before + v_gain;
  v_tier_after  := public.tier_for_xp(v_total_after);

  select count(*) into v_drill_count
  from public.xp_events where athlete_id = p_athlete_id and source = 'drill';
  v_heat := public.athlete_heat(p_athlete_id);

  -- Evaluate every global cap the athlete hasn't earned yet. Criteria are keyed
  -- off the cap `code`; thresholds are intentionally simple for the MVP.
  for v_cap in
    select c.* from public.caps c
    where c.club_id is null
      and not exists (
        select 1 from public.athlete_caps ac
        where ac.athlete_id = p_athlete_id and ac.cap_id = c.id
      )
  loop
    v_qualifies := case v_cap.code
      when 'first_session' then v_drill_count >= 1
      when 'five_sessions' then v_drill_count >= 5
      when 'ten_sessions'  then v_drill_count >= 10
      when 'heat_3'        then v_heat >= 3
      when 'heat_7'        then v_heat >= 7
      when 'tier_pro'      then v_total_after >= 700
      when 'xp_1000'       then v_total_after >= 1000
      else false
    end;

    if v_qualifies then
      insert into public.athlete_caps (athlete_id, club_id, cap_id)
      values (p_athlete_id, v_athlete.club_id, v_cap.id)
      on conflict (athlete_id, cap_id) do nothing;

      if v_cap.xp_reward > 0 then
        insert into public.xp_events (athlete_id, club_id, source, xp, note)
        values (p_athlete_id, v_athlete.club_id, 'cap', v_cap.xp_reward,
                'Cap: ' || v_cap.name);
        v_total_after := v_total_after + v_cap.xp_reward;
      end if;

      v_new_caps := v_new_caps || jsonb_build_object(
        'code', v_cap.code, 'name', v_cap.name, 'icon', v_cap.icon
      );
    end if;
  end loop;

  -- Matchday Challenge (the Set): for every live Set this week that contains the
  -- drill just logged, targets this athlete's cohort, is visible to their club,
  -- and isn't already banked — check whether the whole Set is now done.
  for v_prog in
    select p.* from public.programs p
    where p.sport = v_athlete.sport
      and p.age_group = v_athlete.age_group
      and (p.club_id is null or p.club_id = v_athlete.club_id)
      and p.week_start = v_week_start
      and exists (
        select 1 from public.program_drills pd
        where pd.program_id = p.id and pd.drill_id = p_drill_id
      )
      and not exists (
        select 1 from public.program_completions pc
        where pc.athlete_id = p_athlete_id and pc.program_id = p.id
      )
  loop
    select count(*) into v_required
    from public.program_drills pd where pd.program_id = v_prog.id;

    -- How many of the Set's drills have a qualifying drill XP event this week.
    select count(*) into v_done
    from public.program_drills pd
    where pd.program_id = v_prog.id
      and exists (
        select 1 from public.xp_events e
        where e.athlete_id = p_athlete_id
          and e.source = 'drill'
          and e.drill_id = pd.drill_id
          and e.created_at >= v_prog.week_start
      );

    if v_required > 0 and v_done >= v_required then
      insert into public.program_completions (athlete_id, club_id, program_id)
      values (p_athlete_id, v_athlete.club_id, v_prog.id)
      on conflict (athlete_id, program_id) do nothing;

      -- FOUND is true only if the completion row was actually inserted (not a
      -- conflict), so the bonus is banked exactly once per athlete per Set.
      if found then
        insert into public.xp_events (athlete_id, club_id, source, xp, note)
        values (p_athlete_id, v_athlete.club_id, 'bonus', v_set_bonus_xp,
                'Matchday Challenge complete');
        v_total_after   := v_total_after + v_set_bonus_xp;
        v_set_completed := true;
        v_set_bonus     := v_set_bonus + v_set_bonus_xp;
      end if;
    end if;
  end loop;

  -- Recompute final tier in case a cap reward or Set bonus bumped it.
  v_tier_after := public.tier_for_xp(v_total_after);

  return jsonb_build_object(
    'xp_gained',     v_gain,
    'total_xp',      v_total_after,
    'tier',          v_tier_after,
    'tier_changed',  v_tier_after is distinct from v_tier_before,
    'heat',          v_heat,
    'new_caps',      v_new_caps,
    'drill_title',   v_drill.title,
    'set_completed', v_set_completed,
    'set_bonus_xp',  v_set_bonus
  );
end;
$$;

grant execute on function public.complete_drill(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security (follows the established club-scoped, role-gated pattern).
-- Completion-ledger writes are RPC-only (SECURITY DEFINER), so there is no client
-- INSERT policy on program_completions — keeping the ledger authoritative.
-- ---------------------------------------------------------------------------

alter table public.programs            enable row level security;
alter table public.program_drills      enable row level security;
alter table public.program_completions enable row level security;

-- programs: global Sets (club_id IS NULL) plus the caller's own club Sets.
create policy programs_select on public.programs
  for select using (
    club_id is null
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

-- Coaches / club admins can author club Sets; global Sets are admin/seed-only.
create policy programs_insert on public.programs
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and (
      club_id = public.current_club_id()
      or (club_id is null and public.current_role() = 'admin')
    )
  );

create policy programs_update on public.programs
  for update using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );

-- program_drills: mirrors programs (club_id denormalised; NULL = global).
create policy program_drills_select on public.program_drills
  for select using (
    club_id is null
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

create policy program_drills_insert on public.program_drills
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and (
      club_id = public.current_club_id()
      or (club_id is null and public.current_role() = 'admin')
    )
  );

create policy program_drills_update on public.program_drills
  for update using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );

-- program_completions: readable within the caller's club; admins see all. No
-- INSERT policy — writes go through complete_drill() only.
create policy program_completions_select on public.program_completions
  for select using (
    club_id = public.current_club_id() or public.current_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Seed global Matchday Challenges (club_id NULL) for the CURRENT week, built from
-- the seeded global drills. week_start = this week's Monday via date_trunc, so it
-- aligns exactly with the detection logic in complete_drill above.
-- ---------------------------------------------------------------------------

-- Rugby League · Under 13 — sharpen the ruck.
with prog as (
  insert into public.programs (club_id, sport, age_group, title, description, week_start)
  values (
    null, 'rugby_league', 'u13', 'This Week''s Set — Own the Ruck',
    'Two drills, one week. Bank them both to complete the Set and keep your Heat alive.',
    date_trunc('week', current_date)::date
  )
  returning id
)
insert into public.program_drills (program_id, drill_id, position, club_id)
select prog.id, d.id, x.position, null
from prog
cross join (values
  ('Defensive Line Speed', 1),
  ('Play-the-Ball Tempo',  2)
) as x(title, position)
join public.drills d on d.title = x.title and d.club_id is null;

-- Soccer · Under 10 — first-touch focus.
with prog as (
  insert into public.programs (club_id, sport, age_group, title, description, week_start)
  values (
    null, 'soccer', 'u10', 'This Week''s Set — First-Touch Friday',
    'Close control and keeping the ball. Finish both drills this week to bank the bonus.',
    date_trunc('week', current_date)::date
  )
  returning id
)
insert into public.program_drills (program_id, drill_id, position, club_id)
select prog.id, d.id, x.position, null
from prog
cross join (values
  ('Dribbling Through Cones', 1),
  ('Shielding the Ball',      2)
) as x(title, position)
join public.drills d on d.title = x.title and d.club_id is null;
