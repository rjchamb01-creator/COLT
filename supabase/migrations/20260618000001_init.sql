-- Talyn — initial schema
-- Multi-tenant model: clubs own athletes; every auth user has one profile with a role.
-- Access is club-scoped and role-based, enforced via Row Level Security (RLS).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Roles, ordered roughly by privilege. 'parent' is the default for self sign-up.
create type public.user_role as enum (
  'admin',        -- platform staff
  'club_admin',   -- runs a club (manages coaches, athletes, licence)
  'coach',        -- coaches athletes within a club
  'parent',       -- manages one or more athletes (children)
  'athlete'       -- the athlete themselves (older age groups)
);

-- MVP launch sports (Technical Blueprint / PRD).
create type public.sport as enum ('rugby_league', 'soccer');

-- The three MVP age groups.
create type public.age_group as enum ('u10', 'u13', 'u16');

-- Club licence tiers map to the Business Case pricing bands.
create type public.license_tier as enum ('starter', 'growth', 'elite');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.clubs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  license_tier public.license_tier not null default 'starter',
  created_at   timestamptz not null default now()
);

-- One row per auth.users row. The profile is the tenant membership record:
-- it pins the user to a club and carries their role.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       public.user_role not null default 'parent',
  club_id    uuid references public.clubs (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Athletes belong to a club and are linked to the parent/guardian profile that
-- manages them. (An athlete-user can be their own parent_id.)
create table public.athletes (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  parent_id  uuid references public.profiles (id) on delete set null,
  full_name  text not null,
  sport      public.sport not null,
  age_group  public.age_group not null,
  created_at timestamptz not null default now()
);

create index athletes_club_id_idx  on public.athletes (club_id);
create index athletes_parent_id_idx on public.athletes (parent_id);
create index profiles_club_id_idx  on public.profiles (club_id);

-- ---------------------------------------------------------------------------
-- Helper functions (used by RLS policies)
-- SECURITY DEFINER so they can read profiles without tripping the very RLS
-- policies that call them (which would otherwise recurse).
-- ---------------------------------------------------------------------------

create or replace function public.current_club_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select club_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile when an auth user is created.
-- full_name / role / club_id are seeded from sign-up metadata when present.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'parent')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.clubs    enable row level security;
alter table public.profiles enable row level security;
alter table public.athletes enable row level security;

-- Clubs: members can see their own club; admins see all.
create policy clubs_select on public.clubs
  for select using (
    id = public.current_club_id() or public.current_role() = 'admin'
  );

-- Club admins can update their own club.
create policy clubs_update on public.clubs
  for update using (
    id = public.current_club_id()
    and public.current_role() in ('club_admin', 'admin')
  );

-- Profiles: you can always see your own; club members see profiles in their club.
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

-- A user may insert their own profile row (the trigger normally does this, but
-- this keeps client-side upserts safe).
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

-- You can update your own profile. Club admins can update profiles in their club.
create policy profiles_update on public.profiles
  for update using (
    id = auth.uid()
    or (club_id = public.current_club_id() and public.current_role() in ('club_admin', 'admin'))
  );

-- Athletes: visible to everyone in the same club.
create policy athletes_select on public.athletes
  for select using (
    club_id = public.current_club_id() or public.current_role() = 'admin'
  );

-- A parent can add athletes to their own club; coaches/club admins can too.
create policy athletes_insert on public.athletes
  for insert with check (
    club_id = public.current_club_id()
    and (
      parent_id = auth.uid()
      or public.current_role() in ('coach', 'club_admin', 'admin')
    )
  );

-- The managing parent, or a coach/club admin in the club, can update an athlete.
create policy athletes_update on public.athletes
  for update using (
    club_id = public.current_club_id()
    and (
      parent_id = auth.uid()
      or public.current_role() in ('coach', 'club_admin', 'admin')
    )
  );
