-- Talyn — Engagement instrumentation (activity_events)
-- Phase 1 telemetry: which features do people actually lean on? The freemium
-- rollout (CLAUDE.md) says Phase 1's job is to land squads, prove the loop, and
-- gather the usage data that DECIDES where the Phase 2 paywall goes. This is that
-- data — and since the headline KPI is parent conversion per club, every row
-- carries the actor's role + club so engagement can be sliced that way.
--
-- This is PLATFORM telemetry, NOT a parent/club-facing insight dashboard (that's
-- the PAID Phase 2 individual lever). So reads are gated to platform `admin`
-- only; nothing here is exposed to coaches/parents/athletes.
--
-- Domain ACTIONS (sessions logged, Sets completed, posts/sessions created) are
-- already captured by xp_events / program_completions / announcements / events.
-- This table fills the gap they don't: navigation + feature VIEWS — especially
-- for browsing parents (the payer) who don't write to any domain table.

create table public.activity_events (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Denormalised from the actor's profile so analytics can slice by role/club
  -- without a join (and so a later role change doesn't rewrite history).
  role       public.user_role not null,
  feature    text not null,                  -- 'dashboard','squad','training','challenge','ladder','athletes',…
  action     text not null default 'view',   -- 'view' for now; room for 'open','click' later
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_club_idx    on public.activity_events (club_id);
create index activity_events_feature_idx  on public.activity_events (feature);
create index activity_events_role_idx     on public.activity_events (role);
create index activity_events_created_idx  on public.activity_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
--   INSERT  any authenticated user may log THEIR OWN activity, and only for
--           their own club + their own current role (no spoofing other users,
--           clubs, or roles).
--   SELECT  platform admin ONLY. This is business telemetry, not a club/parent
--           feature — keeping reads admin-only avoids building the paid Phase 2
--           insight dashboard by accident.
-- No UPDATE/DELETE policies: the log is append-only.
-- ---------------------------------------------------------------------------

alter table public.activity_events enable row level security;

create policy activity_events_insert on public.activity_events
  for insert with check (
    profile_id = auth.uid()
    and club_id = public.current_club_id()
    and role = public.current_role()
  );

create policy activity_events_select on public.activity_events
  for select using (public.current_role() = 'admin');
