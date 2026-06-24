-- Talyn — Training Library
-- A catalogue of training drills, tagged by sport and age group, that athletes
-- and coaches browse. Reuses the existing `sport` and `age_group` enums.
--
-- Tenancy: club_id NULL  = platform/global content, visible to every club.
--          club_id set   = club-specific content, visible only to that club and
--                          authored by its coach/club_admin (or platform admin).

create table public.drills (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs (id) on delete cascade,
  sport        public.sport not null,
  age_group    public.age_group not null,
  title        text not null,
  description  text not null,
  duration_min integer not null check (duration_min > 0),
  video_url    text,
  created_at   timestamptz not null default now()
);

create index drills_club_id_idx   on public.drills (club_id);
create index drills_sport_idx     on public.drills (sport);
create index drills_age_group_idx on public.drills (age_group);

-- ---------------------------------------------------------------------------
-- Row Level Security (follows the established club-scoped, role-gated pattern)
-- ---------------------------------------------------------------------------

alter table public.drills enable row level security;

-- Anyone authenticated can read global drills (club_id IS NULL) plus the drills
-- belonging to their own club. Platform admins see everything.
create policy drills_select on public.drills
  for select using (
    club_id is null
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

-- Coaches / club admins (and platform admins) can author drills for their club.
-- Global drills (club_id IS NULL) are seeded server-side / by platform admins only.
create policy drills_insert on public.drills
  for insert with check (
    public.current_role() in ('coach', 'club_admin', 'admin')
    and (
      club_id = public.current_club_id()
      or (club_id is null and public.current_role() = 'admin')
    )
  );

-- Same gate for edits: own-club content for coach/club_admin; admins everywhere.
create policy drills_update on public.drills
  for update using (
    public.current_role() = 'admin'
    or (
      club_id = public.current_club_id()
      and public.current_role() in ('coach', 'club_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Seed global drills (club_id NULL) spanning both MVP sports and all age groups.
-- ---------------------------------------------------------------------------

insert into public.drills (club_id, sport, age_group, title, description, duration_min, video_url)
values
  (null, 'rugby_league', 'u10', 'Ball Handling Basics',
   'Partner passing in pairs over short distances to build clean catch-and-pass technique and soft hands.',
   15, null),
  (null, 'rugby_league', 'u13', 'Defensive Line Speed',
   'Up-and-back shuttle drill teaching a connected defensive line to move forward together and reset quickly.',
   20, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  (null, 'rugby_league', 'u16', 'Offload Under Pressure',
   'Contact-bag drill developing the timing of the offload in the tackle while keeping the ball alive.',
   25, null),
  (null, 'soccer', 'u10', 'Dribbling Through Cones',
   'Slalom dribble through a cone gate course using both feet to improve close control and change of direction.',
   15, null),
  (null, 'soccer', 'u13', 'Passing Triangles',
   'Three-player rondo-style triangle passing to develop first touch, accurate short passing, and movement off the ball.',
   20, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  (null, 'soccer', 'u16', 'Finishing From Crosses',
   'Wide service into the box with timed runs to goal, working on first-time finishing and attacking the near and far post.',
   30, null),
  (null, 'soccer', 'u10', 'Shielding the Ball',
   '1v1 keep-away in a small grid teaching players to use their body to protect possession from a defender.',
   10, null),
  (null, 'rugby_league', 'u13', 'Play-the-Ball Tempo',
   'Repetition drill on a fast, square play-the-ball and dummy-half clearance to quicken ruck speed.',
   15, null);
