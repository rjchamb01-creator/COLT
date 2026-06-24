-- Talyn — Player accounts (athletes log their own progress)
--
-- Until now an athlete was a RECORD managed by a parent/coach; there was no way
-- for the young athlete to have their OWN login linked to that record. This adds
-- a claim/link flow:
--   1. A managing adult (parent who owns the record, or a club coach/admin)
--      generates a single-use invite token for a specific athlete.
--   2. The athlete signs up through /claim?token=… (policy: 13+; under-13s stay
--      on a parent account — the inviting adult is the consent gate).
--   3. claim_athlete() links the new login to the existing record (no duplicate),
--      sets the caller's role to 'athlete', and pins them to the athlete's club.
--
-- New columns on athletes:
--   profile_id  — the athlete's own login once claimed (NULL = unclaimed). Unique:
--                 one login ↔ one player record.
--   claim_token — the secret in the invite link; cleared on claim (single-use).

alter table public.athletes
  add column profile_id  uuid references public.profiles (id) on delete set null,
  add column claim_token text;

-- One login per athlete record, and one athlete record per login.
create unique index athletes_profile_id_key on public.athletes (profile_id)
  where profile_id is not null;
create unique index athletes_claim_token_key on public.athletes (claim_token)
  where claim_token is not null;

-- ---------------------------------------------------------------------------
-- create_athlete_invite — mint (or refresh) a single-use claim token for an
-- athlete. Authorised for the managing parent, or a coach/club_admin in the
-- athlete's club, or a platform admin. Refuses if the athlete is already claimed.
-- Returns the token (the app wraps it in a /claim?token=… link).
-- ---------------------------------------------------------------------------
create or replace function public.create_athlete_invite(p_athlete_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_club   uuid;
  v_role   public.user_role;
  v_ath    public.athletes;
  v_token  text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select club_id, role into v_club, v_role from public.profiles where id = v_uid;
  select * into v_ath from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Athlete not found';
  end if;

  if not (
    v_role = 'admin'
    or (
      v_ath.club_id = v_club
      and (v_role in ('coach', 'club_admin') or v_ath.parent_id = v_uid)
    )
  ) then
    raise exception 'Not allowed to invite a player for this athlete';
  end if;

  if v_ath.profile_id is not null then
    raise exception 'This athlete already has a linked player account';
  end if;

  -- 64 hex chars from two uuids — plenty of entropy, no pgcrypto dependency.
  v_token := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');

  update public.athletes set claim_token = v_token where id = p_athlete_id;
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- peek_athlete_invite — read-only preview for the public /claim page so the kid
-- sees who they're joining as before signing up. Only resolves for an unclaimed
-- token; reveals minimal info (holder of the secret token already knows the kid).
-- ---------------------------------------------------------------------------
create or replace function public.peek_athlete_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ath  public.athletes;
  v_club public.clubs;
begin
  select * into v_ath from public.athletes
  where claim_token = p_token and profile_id is null;
  if not found then
    return null;
  end if;
  select * into v_club from public.clubs where id = v_ath.club_id;

  return jsonb_build_object(
    'full_name', v_ath.full_name,
    'sport', v_ath.sport,
    'age_group', v_ath.age_group,
    'club_name', coalesce(v_club.name, 'your club')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_athlete — link the signed-in (newly created) account to the athlete
-- record behind the token, becoming that player. Single-use. Refuses to convert
-- accounts that shouldn't be players: staff accounts, accounts that already
-- manage athletes (i.e. a parent), or an account already linked to a player.
-- ---------------------------------------------------------------------------
create or replace function public.claim_athlete(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.user_role;
  v_ath  public.athletes;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role in ('admin', 'club_admin', 'coach') then
    raise exception 'Staff accounts can''t be claimed as a player — use a separate account';
  end if;

  if exists (select 1 from public.athletes where parent_id = v_uid) then
    raise exception 'This account manages athletes — create a separate account for the player';
  end if;

  if exists (select 1 from public.athletes where profile_id = v_uid) then
    raise exception 'This account is already linked to a player';
  end if;

  select * into v_ath from public.athletes
  where claim_token = p_token and profile_id is null;
  if not found then
    raise exception 'That invite is invalid or has already been used';
  end if;

  update public.athletes
    set profile_id = v_uid, claim_token = null
    where id = v_ath.id;

  update public.profiles
    set role = 'athlete', club_id = v_ath.club_id
    where id = v_uid;

  return jsonb_build_object('athlete_id', v_ath.id, 'club_id', v_ath.club_id);
end;
$$;

grant execute on function public.create_athlete_invite(uuid) to authenticated;
grant execute on function public.peek_athlete_invite(text)   to authenticated, anon;
grant execute on function public.claim_athlete(text)         to authenticated;

-- ---------------------------------------------------------------------------
-- complete_drill — REPLACED to extend the authorisation check only: a linked
-- athlete (athletes.profile_id = auth.uid()) may now log their OWN sessions.
-- Everything else is identical to ..._000006_programs.sql.
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

  -- Authorisation: a platform admin; a coach/club_admin in the club; the
  -- managing parent; OR the athlete themselves (via the linked player account).
  if not (
    v_caller_role = 'admin'
    or (
      v_athlete.club_id = v_caller_club
      and (
        v_caller_role in ('coach', 'club_admin')
        or v_athlete.parent_id = v_uid
        or v_athlete.profile_id = v_uid
      )
    )
  ) then
    raise exception 'Not allowed to log sessions for this athlete';
  end if;

  select * into v_drill from public.drills
  where id = p_drill_id
    and (club_id is null or club_id = v_athlete.club_id);
  if not found then
    raise exception 'Drill not found';
  end if;

  v_gain := v_drill.duration_min;

  select coalesce(sum(xp), 0) into v_total_before
  from public.xp_events where athlete_id = p_athlete_id;
  v_tier_before := public.tier_for_xp(v_total_before);

  insert into public.xp_events (athlete_id, club_id, source, drill_id, xp, note)
  values (p_athlete_id, v_athlete.club_id, 'drill', p_drill_id, v_gain, v_drill.title);

  v_total_after := v_total_before + v_gain;
  v_tier_after  := public.tier_for_xp(v_total_after);

  select count(*) into v_drill_count
  from public.xp_events where athlete_id = p_athlete_id and source = 'drill';
  v_heat := public.athlete_heat(p_athlete_id);

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
