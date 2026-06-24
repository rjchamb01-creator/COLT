-- Talyn — Squad Hub (club comms + training schedule)
-- The FREE collective engagement layer that completes the club–parent–athlete
-- loop: the club posts to the Squad, the Squad shows up, the loop keeps turning.
-- Per the freemium split this layer is never paywalled (see CLAUDE.md).
--
--   announcements   club/coach posts to the Squad (the feed's comms).
--   events          the training schedule (sessions). Schedule-only — no
--                   attendance/RSVP (that's a Phase 2 paid, individual-layer lever).
--
-- The Squad Feed itself needs NO table — it is assembled in the app layer by
-- merging recent announcements, upcoming events, and squad milestones derived
-- from the existing gamification ledgers (athlete_caps, program_completions,
-- xp_events), all of which already have club-scoped SELECT policies.
--
-- MVP simplification: one club == one Squad. There is no separate squad entity,
-- so both tables are club-scoped (club_id). Unlike drills/caps/programs there is
-- NO global/platform content here — every row belongs to exactly one club, so
-- club_id is NOT NULL and there is no `club_id IS NULL` branch in the policies.
-- RLS otherwise follows the established club-scoped, role-gated pattern.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A post from the club/coach to the Squad. author_id references profiles (which
-- is 1:1 with auth.users) so the feed can show who posted; ON DELETE SET NULL
-- keeps the post if the author's profile is removed.
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index announcements_club_idx    on public.announcements (club_id);
create index announcements_created_idx  on public.announcements (created_at desc);

-- A scheduled training session. sport / age_group are nullable for optional
-- cohort targeting (reusing the existing enums); NULL = the whole Squad.
-- Schedule-only: no attendance or RSVP columns (Phase 2 paid layer).
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  starts_at   timestamptz not null,
  sport       public.sport,
  age_group   public.age_group,
  created_at  timestamptz not null default now()
);

create index events_club_idx     on public.events (club_id);
create index events_starts_idx   on public.events (starts_at);

-- ---------------------------------------------------------------------------
-- Row Level Security (the security boundary — the Server Actions just insert).
-- Follows the programs/drills pattern, minus the global (club_id IS NULL) branch:
--   SELECT  scoped to the caller's club (admins see all).
--   INSERT  gated to coach/club_admin/admin posting to their OWN club.
--   UPDATE  same role gate; admins may edit any club's.
-- ---------------------------------------------------------------------------

alter table public.announcements enable row level security;
alter table public.events        enable row level security;

-- announcements -------------------------------------------------------------
create policy announcements_select on public.announcements
  for select using (
    club_id = public.current_club_id() or public.current_role() = 'admin'
  );

create policy announcements_insert on public.announcements
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and club_id = public.current_club_id()
  );

create policy announcements_update on public.announcements
  for update using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );

-- events --------------------------------------------------------------------
create policy events_select on public.events
  for select using (
    club_id = public.current_club_id() or public.current_role() = 'admin'
  );

create policy events_insert on public.events
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and club_id = public.current_club_id()
  );

create policy events_update on public.events
  for update using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );
