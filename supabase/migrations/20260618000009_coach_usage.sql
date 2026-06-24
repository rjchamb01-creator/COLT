-- Talyn — AI Coach hardening: per-user rate limiting + usage logging.
--
-- The AI Coach is FREE (Phase 1) but each message calls a paid Claude API, so an
-- unbounded chatbot is a cost + abuse risk. This adds a per-user rate limit and
-- logs every coach message as engagement telemetry — reusing the existing
-- `activity_events` table (feature='coach', action='message') so coach usage
-- shows up in /dashboard/insights alongside feature views.
--
-- Why an RPC: `activity_events` SELECT is admin-only, so a normal user cannot
-- read their own rows to count them. This SECURITY DEFINER function does the
-- count + insert server-side, scoped to auth.uid() — the same authoritative-RPC
-- pattern as complete_drill / create_club. The values it inserts still satisfy
-- the activity_events INSERT policy (own profile + club + role).

create or replace function public.record_coach_message()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_club   uuid;
  v_role   public.user_role;
  v_count  integer;
  -- Tune here: how many coach messages a single user may send per window.
  v_limit  constant integer  := 20;
  v_window constant interval := interval '5 minutes';
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select club_id, role into v_club, v_role
  from public.profiles where id = v_uid;

  if v_club is null then
    raise exception 'No club';
  end if;

  -- How many coach messages this user has sent inside the window.
  select count(*) into v_count
  from public.activity_events
  where profile_id = v_uid
    and feature = 'coach'
    and action = 'message'
    and created_at >= now() - v_window;

  -- Over the limit → deny without logging another message.
  if v_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', v_limit,
      'window_seconds', extract(epoch from v_window)::int
    );
  end if;

  -- Under the limit → log this message (doubles as the rate-limit ledger and as
  -- Insights telemetry) and allow it.
  insert into public.activity_events (club_id, profile_id, role, feature, action)
  values (v_club, v_uid, v_role, 'coach', 'message');

  return jsonb_build_object(
    'allowed', true,
    'count', v_count + 1,
    'limit', v_limit,
    'window_seconds', extract(epoch from v_window)::int
  );
end;
$$;

grant execute on function public.record_coach_message() to authenticated;
