-- Talyn — Gamification (the moat)
-- The engagement loop: XP → Tiers → The Ladder → Caps → Heat.
--
--   XP      append-only ledger (xp_events). Completing a Training Library drill
--           earns XP equal to the drill's duration in minutes.
--   Tiers   Rookie → Rising → Starter → Pro → Elite → Legend, derived from total
--           XP via tier_for_xp(); XP is the single source of truth (no stored tier).
--   Ladder  the `ladder` view ranks athletes by total XP within a club.
--   Caps    earnable achievements (caps catalogue + athlete_caps earned ledger).
--   Heat    consecutive-day training streak, computed from the ledger.
--
-- Writes to the ledgers go through the complete_drill() SECURITY DEFINER RPC so
-- the append-only ledger and cap-awarding stay authoritative (same pattern as the
-- club-onboarding RPCs). RLS still scopes all reads to the caller's club.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Where an XP grant came from. 'drill' = a logged Training Library session;
-- 'cap' = a one-off bonus attached to earning a cap; 'bonus' = manual/admin.
create type public.xp_source as enum ('drill', 'cap', 'bonus');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Append-only XP ledger. club_id is denormalised from the athlete so RLS and the
-- ladder can scope by club without a join.
create table public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  club_id    uuid not null references public.clubs (id) on delete cascade,
  source     public.xp_source not null,
  drill_id   uuid references public.drills (id) on delete set null,
  xp         integer not null check (xp > 0),
  note       text,
  created_at timestamptz not null default now()
);

create index xp_events_athlete_idx on public.xp_events (athlete_id);
create index xp_events_club_idx    on public.xp_events (club_id);

-- Caps catalogue. club_id NULL = platform/global caps every club can earn;
-- non-null = club-specific caps (mirrors the drills tenancy model).
-- `code` is the stable machine key the award logic keys off.
create table public.caps (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs (id) on delete cascade,
  code        text not null,
  name        text not null,
  description text not null,
  icon        text not null default '🏅',
  xp_reward   integer not null default 0 check (xp_reward >= 0),
  created_at  timestamptz not null default now(),
  unique (club_id, code)
);

-- Earned-caps ledger: one row the first time an athlete earns a cap.
create table public.athlete_caps (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  club_id    uuid not null references public.clubs (id) on delete cascade,
  cap_id     uuid not null references public.caps (id) on delete cascade,
  earned_at  timestamptz not null default now(),
  unique (athlete_id, cap_id)
);

create index athlete_caps_athlete_idx on public.athlete_caps (athlete_id);
create index athlete_caps_club_idx    on public.athlete_caps (club_id);

-- ---------------------------------------------------------------------------
-- Tier helper — XP thresholds. Kept in sync with src/lib/gamification.ts.
-- ---------------------------------------------------------------------------

create or replace function public.tier_for_xp(p_xp integer)
returns text
language sql
immutable
as $$
  select case
    when p_xp >= 3000 then 'legend'
    when p_xp >= 1500 then 'elite'
    when p_xp >= 700  then 'pro'
    when p_xp >= 300  then 'starter'
    when p_xp >= 100  then 'rising'
    else 'rookie'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Heat helper — consecutive-day training streak ending today (or yesterday, so
-- a streak doesn't read as cold until a full day has been missed). Counts
-- distinct UTC days that have at least one 'drill' XP event.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_heat(p_athlete_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_streak integer := 0;
  v_day    date := current_date;
begin
  -- Anchor: if there's nothing today, allow the streak to start at yesterday.
  if not exists (
    select 1 from public.xp_events
    where athlete_id = p_athlete_id and source = 'drill'
      and (created_at at time zone 'utc')::date = v_day
  ) then
    if exists (
      select 1 from public.xp_events
      where athlete_id = p_athlete_id and source = 'drill'
        and (created_at at time zone 'utc')::date = v_day - 1
    ) then
      v_day := v_day - 1;
    else
      return 0;
    end if;
  end if;

  -- Walk backwards while each day has activity.
  loop
    exit when not exists (
      select 1 from public.xp_events
      where athlete_id = p_athlete_id and source = 'drill'
        and (created_at at time zone 'utc')::date = v_day
    );
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;

  return v_streak;
end;
$$;

-- This SECURITY DEFINER helper bypasses RLS, so don't expose it to clients (it
-- would leak any athlete's streak cross-club). complete_drill() calls it
-- internally as the function owner, which always retains EXECUTE. The UI derives
-- Heat client-side via computeHeat() in src/lib/gamification.ts.
-- Revoke from anon/authenticated too, not just PUBLIC: Supabase's default
-- privileges grant EXECUTE to those API roles directly, and a PUBLIC revoke
-- alone leaves those direct grants intact.
revoke execute on function public.athlete_heat(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- complete_drill — log a Training Library session for an athlete, award XP, and
-- grant any newly-earned caps. Returns a summary the UI uses for the level-up
-- moment. SECURITY DEFINER: it authorises the caller itself, then writes across
-- RLS so the ledgers stay authoritative.
-- ---------------------------------------------------------------------------

create or replace function public.complete_drill(p_athlete_id uuid, p_drill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_caller_club  uuid;
  v_caller_role  public.user_role;
  v_athlete      public.athletes;
  v_drill        public.drills;
  v_gain         integer;
  v_total_before integer;
  v_total_after  integer;
  v_tier_before  text;
  v_tier_after   text;
  v_drill_count  integer;
  v_heat         integer;
  v_new_caps     jsonb := '[]'::jsonb;
  v_cap          record;
  v_qualifies    boolean;
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

  -- Recompute final tier in case a cap reward bumped it.
  v_tier_after := public.tier_for_xp(v_total_after);

  return jsonb_build_object(
    'xp_gained',    v_gain,
    'total_xp',     v_total_after,
    'tier',         v_tier_after,
    'tier_changed', v_tier_after is distinct from v_tier_before,
    'heat',         v_heat,
    'new_caps',     v_new_caps,
    'drill_title',  v_drill.title
  );
end;
$$;

grant execute on function public.complete_drill(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Ladder — per-athlete total XP within a club, used by the leaderboard.
-- security_invoker so the base-table RLS (club-scoped) applies to the view.
-- ---------------------------------------------------------------------------

create view public.ladder
with (security_invoker = on) as
  select
    a.id        as athlete_id,
    a.club_id   as club_id,
    a.full_name as full_name,
    a.sport     as sport,
    a.age_group as age_group,
    coalesce(sum(e.xp), 0)::bigint                          as total_xp,
    count(e.id) filter (where e.source = 'drill')::bigint   as sessions
  from public.athletes a
  left join public.xp_events e on e.athlete_id = a.id
  group by a.id, a.club_id, a.full_name, a.sport, a.age_group;

grant select on public.ladder to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security (follows the established club-scoped, role-gated pattern).
-- Ledger writes are RPC-only (SECURITY DEFINER), so no client INSERT policies
-- on xp_events / athlete_caps — that keeps the append-only ledgers authoritative.
-- ---------------------------------------------------------------------------

alter table public.xp_events    enable row level security;
alter table public.caps         enable row level security;
alter table public.athlete_caps enable row level security;

-- xp_events: readable within the caller's club; admins see all.
create policy xp_events_select on public.xp_events
  for select using (
    club_id = public.current_club_id() or public.current_role() = 'admin'
  );

-- caps: global caps (club_id IS NULL) plus the caller's own club caps.
create policy caps_select on public.caps
  for select using (
    club_id is null
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

-- Coaches / club admins can author club caps; global caps are admin/seed-only.
create policy caps_insert on public.caps
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and (
      club_id = public.current_club_id()
      or (club_id is null and public.current_role() = 'admin')
    )
  );

create policy caps_update on public.caps
  for update using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );

-- athlete_caps: readable within the caller's club; admins see all.
create policy athlete_caps_select on public.athlete_caps
  for select using (
    club_id = public.current_club_id() or public.current_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Seed global caps (club_id NULL) — the starter set every club can earn.
-- ---------------------------------------------------------------------------

insert into public.caps (club_id, code, name, description, icon, xp_reward)
values
  (null, 'first_session', 'First Cap',   'Log your very first training session.',        '🎟️', 0),
  (null, 'five_sessions', 'High Five',    'Bank five training sessions.',                 '🖐️', 0),
  (null, 'ten_sessions',  'Perfect Ten',  'Bank ten training sessions.',                  '🔟', 0),
  (null, 'heat_3',        'Warming Up',   'Train three days in a row — Heat 3.',          '🌡️', 0),
  (null, 'heat_7',        'On Fire',      'Train seven days in a row — Heat 7.',          '🔥', 0),
  (null, 'tier_pro',      'Turning Pro',  'Climb to Pro tier.',                           '⭐', 0),
  (null, 'xp_1000',       'Grand',        'Earn 1,000 XP all-time.',                      '💎', 0);
