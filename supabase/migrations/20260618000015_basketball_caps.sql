-- COLT — Basketball-specific Caps (sport-flavoured achievements).
--
-- The existing global Caps (First Cap, High Five, Heat 7, Turning Pro, …) are
-- sport-agnostic and already apply to basketball athletes. This adds three
-- basketball-only Caps awarded on basketball *sessions* specifically, and teaches
-- complete_drill() to count an athlete's basketball drill sessions so it can
-- evaluate them. Everything else in complete_drill is reproduced verbatim from
-- the 0006 version — the only additions are `v_bball_count` (declared + counted)
-- and three new `when 'bball_*'` cap cases.

-- 1. Seed the basketball Caps (club_id NULL = global; xp_reward 0 like the others).
insert into public.caps (club_id, code, name, description, icon, xp_reward)
values
  (null, 'bball_first', 'First Bucket',  'Log your first basketball session.', '🏀', 0),
  (null, 'bball_five',  'Hooper',        'Bank five basketball sessions.',     '🏀', 0),
  (null, 'bball_ten',   'Court General', 'Bank ten basketball sessions.',      '🏀', 0)
on conflict (club_id, code) do nothing;

-- 2. complete_drill — re-created with basketball-session counting + the new caps.
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
  v_bball_count   integer;
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

  -- Basketball-specific session count (drives the bball_* caps). Only basketball
  -- drill events count; 0 for non-basketball athletes, so the bball caps never
  -- fire for them.
  select count(*) into v_bball_count
  from public.xp_events e
  join public.drills d on d.id = e.drill_id
  where e.athlete_id = p_athlete_id
    and e.source = 'drill'
    and d.sport = 'basketball';

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
      when 'bball_first'   then v_bball_count >= 1
      when 'bball_five'    then v_bball_count >= 5
      when 'bball_ten'     then v_bball_count >= 10
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
