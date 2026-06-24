-- Talyn / COLT — Payments + entitlement foundation (Phase 2)
--
-- The freemium line is collective (free) vs individual (paid). This migration adds
-- the *seam* the paid surfaces hang off: a per-athlete subscription, an entitlement
-- helper used by RLS, and the 70/30 revenue ledger attributed to the referring club.
-- It does NOT build the AI Program Recommender or the benchmark engine — only the
-- entitlement seam those will both depend on.
--
-- Model (CLAUDE.md "curated-expert refinement"):
--   * Two paid tiers — tier1 (~$9.99/mo, the training edge) and tier2 (~$19.99/mo,
--     "close to a personal coach"). free = the collective layer.
--   * The PAYER is the parent; CONVERSION is per-athlete — so a subscription row is
--     keyed to one athlete (a parent paying for two kids has two subscriptions).
--   * Revenue split is 70% COLT / 30% the referring club, attributed to the club
--     that drove the signup (the athlete's club). Recorded per paid invoice.
--
-- Stripe is the processor: all writes to these tables happen in the webhook using
-- the service-role key (which bypasses RLS), the same "writes go through one
-- privileged path, RLS only scopes reads" pattern the gamification ledgers use.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- The entitlement tiers, in ascending order of access. `free` is the implicit
-- tier of any athlete with no live subscription (we don't store free rows).
create type public.subscription_tier as enum ('free', 'tier1', 'tier2');

-- Mirrors Stripe's Subscription.status values. "Live" (grants entitlement) =
-- 'trialing' or 'active' — see subscription_is_live() below.
create type public.subscription_status as enum (
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per athlete subscription. club_id is denormalised from the athlete at
-- creation so revenue attribution and club-scoped RLS work without a join.
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  athlete_id             uuid not null references public.athletes (id) on delete cascade,
  club_id                uuid not null references public.clubs (id) on delete cascade,
  -- The paying parent/guardian profile (billing). NULL-safe on profile deletion
  -- so the historical subscription/ledger survives.
  payer_id               uuid references public.profiles (id) on delete set null,
  tier                   public.subscription_tier not null default 'tier1',
  status                 public.subscription_status not null default 'incomplete',
  -- Stripe handles. customer = the parent (shared across their kids' subs);
  -- subscription = this row's Stripe object (the webhook upsert key).
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- At most one LIVE subscription per athlete (historical canceled rows are allowed,
-- so a re-subscribe creates a fresh Stripe object without colliding). This is the
-- "conversion is per-athlete" guarantee at the database level.
create unique index subscriptions_one_live_per_athlete
  on public.subscriptions (athlete_id)
  where status in ('trialing', 'active', 'past_due');

create index subscriptions_club_idx  on public.subscriptions (club_id);
create index subscriptions_payer_idx on public.subscriptions (payer_id);

-- The 70/30 revenue ledger: one row per PAID Stripe invoice. This is the durable
-- record the club's 30% payout is computed from. stripe_invoice_id is unique so
-- the webhook is idempotent (Stripe retries deliver the same invoice).
create table public.subscription_invoices (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references public.subscriptions (id) on delete set null,
  athlete_id        uuid references public.athletes (id) on delete set null,
  -- The club the 30% is attributed to (NOT NULL — attribution is the point of
  -- this table). Denormalised so a club's payout query never needs the sub row.
  club_id           uuid not null references public.clubs (id) on delete cascade,
  payer_id          uuid references public.profiles (id) on delete set null,
  tier              public.subscription_tier not null,
  stripe_invoice_id text not null unique,
  -- Money in the smallest currency unit (cents), straight from Stripe.
  amount_total      integer not null check (amount_total >= 0),
  currency          text not null default 'aud',
  -- The split, stored explicitly (not just a rate) so a historical payout is
  -- auditable even if the share ever changes. club_share + colt_share = amount.
  club_share_bps    integer not null default 3000 check (club_share_bps between 0 and 10000),
  club_share        integer not null check (club_share >= 0),
  colt_share        integer not null check (colt_share >= 0),
  period_start      timestamptz,
  period_end        timestamptz,
  created_at        timestamptz not null default now()
);

create index subscription_invoices_club_idx on public.subscription_invoices (club_id);
create index subscription_invoices_sub_idx  on public.subscription_invoices (subscription_id);

-- ---------------------------------------------------------------------------
-- Entitlement seam
--
-- These helpers are the single chokepoint that decides paid access, mirroring
-- current_club_id() / current_role(). tier_rank + subscription_is_live are pure;
-- the *_entitled helpers are SECURITY DEFINER so they read subscriptions without
-- tripping its RLS.
-- ---------------------------------------------------------------------------

-- Ordinal for tier comparison: free < tier1 < tier2.
create or replace function public.tier_rank(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'tier2' then 2
    when 'tier1' then 1
    else 0
  end;
$$;

-- The statuses that grant access. 'past_due' is intentionally NOT live — Stripe
-- keeps a subscription 'active' through the grace period and only flips it to
-- 'past_due' once retries fail, so cutting access there is the correct behaviour.
create or replace function public.subscription_is_live(p_status public.subscription_status)
returns boolean
language sql
immutable
as $$
  select p_status in ('trialing', 'active');
$$;

-- The effective entitled tier for an athlete: the tier of its live subscription,
-- or 'free' when there is none.
create or replace function public.athlete_tier(p_athlete_id uuid)
returns public.subscription_tier
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.tier
      from public.subscriptions s
      where s.athlete_id = p_athlete_id
        and public.subscription_is_live(s.status)
      order by public.tier_rank(s.tier) desc
      limit 1
    ),
    'free'::public.subscription_tier
  );
$$;

-- Does this athlete have at least the given tier?
create or replace function public.athlete_entitled(
  p_athlete_id uuid,
  p_min_tier   public.subscription_tier default 'tier1'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tier_rank(public.athlete_tier(p_athlete_id))
       >= public.tier_rank(p_min_tier);
$$;

-- athlete_tier / athlete_entitled read across clubs (a definer bypasses RLS), so
-- they'd let any authed user probe whether an arbitrary athlete is subscribed.
-- Keep them as internal building blocks — only current_user_entitled (below),
-- which is anchored to the caller, is exposed. (Same hygiene as athlete_heat.)
revoke execute on function public.athlete_tier(uuid)
  from public, anon, authenticated;
revoke execute on function public.athlete_entitled(uuid, public.subscription_tier)
  from public, anon, authenticated;

-- Caller-anchored entitlement, used by RLS and the app to decide whether the
-- CURRENT user may see paid content. True when:
--   * the caller is staff/admin (clubs are the free distribution channel and
--     staff manage content, so they always see it — they just can't be billed); OR
--   * the caller is a linked athlete whose own record is entitled; OR
--   * the caller is a parent who manages at least one entitled athlete.
-- The premium Training Library (the one gated surface) productises per-athlete
-- billing into a per-caller view: a parent who pays for any of their kids can
-- browse the deeper library; an athlete account unlocks off its own subscription.
create or replace function public.current_user_entitled(
  p_min_tier public.subscription_tier default 'tier1'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.user_role;
begin
  if v_uid is null then
    return false;
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role in ('admin', 'club_admin', 'coach') then
    return true;
  end if;

  return exists (
    select 1
    from public.athletes a
    where (a.parent_id = v_uid or a.profile_id = v_uid)
      and public.athlete_entitled(a.id, p_min_tier)
  );
end;
$$;

grant execute on function public.tier_rank(public.subscription_tier) to public;
grant execute on function public.subscription_is_live(public.subscription_status) to public;
grant execute on function public.current_user_entitled(public.subscription_tier)
  to authenticated, anon;

-- ---------------------------------------------------------------------------
-- The gated surface — premium ("deeper / position-specific") Training Library.
--
-- A single boolean turns a drill into paid content. We extend drills_select so a
-- premium drill is only returned when the caller is entitled; everything else in
-- the library stays free. This is the literal RLS entitlement seam: non-payers
-- can't even SELECT premium rows (no client-side gate to bypass).
-- ---------------------------------------------------------------------------

alter table public.drills
  add column is_premium boolean not null default false;

create index drills_is_premium_idx on public.drills (is_premium) where is_premium;

drop policy drills_select on public.drills;

create policy drills_select on public.drills
  for select using (
    (
      club_id is null
      or club_id = public.current_club_id()
      or public.current_role() = 'admin'
    )
    and (
      not is_premium
      or public.current_user_entitled('tier1')
    )
  );

-- Lets a non-entitled member see HOW MANY pro drills they'd unlock, without
-- leaking the content (the upsell teaser). Counts premium drills in the caller's
-- own scope (global + their club); returns 0 once they're entitled (nothing is
-- locked for them). SECURITY DEFINER so it can count rows RLS is hiding.
create or replace function public.locked_premium_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club uuid := public.current_club_id();
begin
  if public.current_user_entitled('tier1') then
    return 0;
  end if;
  return (
    select count(*)::int
    from public.drills d
    where d.is_premium
      and (d.club_id is null or d.club_id = v_club)
  );
end;
$$;

grant execute on function public.locked_premium_count() to authenticated;

-- Seal the write path too. RLS hides premium drills from reads, but complete_drill
-- is SECURITY DEFINER and looks a drill up by club visibility only — so a caller
-- who knew a premium drill's id could still bank XP for it. This BEFORE-INSERT
-- trigger on the XP ledger refuses a 'drill' grant for a premium drill unless the
-- athlete is entitled, closing the gate without re-pasting complete_drill's body
-- (additive — survives future complete_drill revisions). Uses the per-athlete
-- entitlement helper, the same seam the future paid surfaces will read.
create or replace function public.enforce_premium_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'drill' and new.drill_id is not null then
    if exists (
      select 1 from public.drills d
      where d.id = new.drill_id and d.is_premium
    ) and not public.athlete_entitled(new.athlete_id, 'tier1') then
      raise exception 'This drill requires a Tier 1 membership';
    end if;
  end if;
  return new;
end;
$$;

create trigger xp_events_premium_gate
  before insert on public.xp_events
  for each row execute function public.enforce_premium_entitlement();

-- ---------------------------------------------------------------------------
-- Row Level Security — reads only. All writes go through the Stripe webhook with
-- the service-role key, so there are deliberately NO insert/update/delete
-- policies (clients can never forge a subscription or an invoice).
-- ---------------------------------------------------------------------------

alter table public.subscriptions         enable row level security;
alter table public.subscription_invoices enable row level security;

-- subscriptions: the paying parent sees their own; a linked athlete sees the sub
-- on their own record; club_admins see their club's (to track conversion — the
-- headline KPI — and their 30% base); platform admins see all.
create policy subscriptions_select on public.subscriptions
  for select using (
    payer_id = auth.uid()
    or public.current_role() = 'admin'
    or (club_id = public.current_club_id() and public.current_role() = 'club_admin')
    or exists (
      select 1 from public.athletes a
      where a.id = subscriptions.athlete_id and a.profile_id = auth.uid()
    )
  );

-- subscription_invoices (the payout ledger): the payer sees their own receipts;
-- club_admins see their club's payout rows; platform admins see all. Coaches are
-- excluded — payouts are a club_admin/finance concern, not a coaching one.
create policy subscription_invoices_select on public.subscription_invoices
  for select using (
    payer_id = auth.uid()
    or public.current_role() = 'admin'
    or (club_id = public.current_club_id() and public.current_role() = 'club_admin')
  );

-- ---------------------------------------------------------------------------
-- Seed — a couple of global premium drills so the gated surface has something to
-- hide. These are the "deeper / position-specific" content the paid tier unlocks;
-- they sit behind the same RLS seam as any future premium drill.
-- ---------------------------------------------------------------------------

insert into public.drills
  (club_id, sport, age_group, title, description, duration_min, video_url, difficulty, is_premium)
values
  (null, 'basketball', 'u16', 'Pick-and-Roll Reads (Pro)',
   'Position-specific session: read the on-ball defender on the pick-and-roll and choose pull-up, split, or pocket pass. Built for guards who already have the basics and want the decision layer.',
   30, null, 3, true),
  (null, 'soccer', 'u16', 'Striker Movement in the Box (Pro)',
   'Advanced finishing patterns: bending runs across the centre-back, near-post attacks, and first-time finishes off a cut-back. For forwards sharpening their off-the-ball edge.',
   30, null, 3, true),
  (null, 'rugby_league', 'u16', 'Halfback Game Management (Pro)',
   'Position-specific kicking and organisation: end-of-set kick selection, controlling field position, and steering the attacking line. For halves stepping up a grade.',
   30, null, 3, true);
