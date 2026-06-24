-- ============================================================================
-- COLT — TEST-MODE LAUNCH SCRIPT (run ONCE, top to bottom)
-- ============================================================================
-- Paste this whole file into the Supabase SQL editor (Dashboard → SQL Editor →
-- New query → paste → Run) for your COLT project, then Run once.
--
-- It applies, IN ORDER:
--   Part A — migration 0016 (payments / entitlement seam: subscriptions table +
--            athlete_entitled() etc.). Stripe keys are NOT required; the billing
--            page simply shows "payments aren't switched on". We grant access in
--            Part C with a direct row instead of a Stripe checkout.
--   Part B — migration 0017 (the AI Program Recommender: athlete-targeted
--            programs + the recommend_program RPC + the per-athlete gate).
--   Part C — TEST-MODE entitlement seed: grants every athlete a live Tier 1 so
--            your kids can use Weekly Programs with no payments. Idempotent and
--            re-runnable; revoke instructions are at the bottom.
--
-- These are the only two migrations your live DB is missing (0010–0015 are
-- already applied). The canonical copies live in supabase/migrations/ — this file
-- is a convenience launcher that is byte-identical to them plus the seed.
--
-- Order matters: Part B depends on Part A. Do not run Part B alone.
-- ============================================================================


-- ############################################################################
-- # PART A — migration 0016_payments.sql
-- ############################################################################

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


-- ############################################################################
-- # PART B — migration 0017_program_recommender.sql
-- ############################################################################

-- COLT — AI Program Recommender (Phase 2, Tier 1 paid surface)
--
-- The personalised "Weekly Programs" lever: an adult (parent, or a 13+ athlete on
-- their own login) states a goal for ONE athlete — e.g. "improve acceleration" —
-- and Claude SELECTS & SEQUENCES already-vetted Training Library drills into a
-- personalised, multi-drill program the athlete works through, earning XP/Heat the
-- normal way. Clean free/paid line: FREE = do the work & earn XP; PAID = the
-- personalised plan telling you what to do.
--
-- Youth-safety: the AI only ever ORDERS/SELECTS approved `drills` rows — it never
-- invents drill content, exercises, or video for a minor. The recommend_program()
-- RPC re-validates that every drill id is a real, club-visible drill before it
-- persists anything (the server-side half of the human-in-the-loop stance the
-- draftDrills tool already takes).
--
-- This is a Tier 1 paid surface. It hangs off the entitlement seam from migration
-- 0016: the recommender is always in the context of ONE athlete, so it gates on
-- the PER-ATHLETE helper athlete_entitled(athlete, 'tier1'). RLS hides/refuses
-- unentitled access; the app also short-circuits with a friendly upsell.
--
-- Reuses the existing programs / program_drills infra rather than a stateless
-- one-shot, so the kid works the plan through the week with progress tracking. The
-- FREE global Matchday Set ("the Set") stays separate: a recommended program is
-- distinguished by a non-null athlete_id + source='recommended', and complete_drill
-- is taught to ignore athlete-targeted programs in its Set-bonus detection so the
-- two never interfere.

-- ---------------------------------------------------------------------------
-- 1. Distinguish a personalised recommended program from the cohort Set.
--    athlete_id NULL + source 'matchday' = the existing free Set (unchanged).
--    athlete_id set + source 'recommended' = a paid, per-athlete program.
--    athlete_id is denormalised onto program_drills (like club_id) so the RLS
--    pattern applies without a join.
-- ---------------------------------------------------------------------------

alter table public.programs
  add column athlete_id uuid references public.athletes (id) on delete cascade,
  add column source     text not null default 'matchday'
                          check (source in ('matchday', 'recommended')),
  add column goal        text;

alter table public.program_drills
  add column athlete_id uuid references public.athletes (id) on delete cascade;

create index programs_athlete_idx       on public.programs (athlete_id) where athlete_id is not null;
create index program_drills_athlete_idx on public.program_drills (athlete_id) where athlete_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Entitlement + management gate for the personalised program (used by RLS and
--    re-used by the app to decide recommender vs upsell).
--
-- True iff the caller may manage p_athlete_id AND that athlete holds Tier 1. The
-- recommender is a per-athlete paid surface, so entitlement is about the ATHLETE's
-- subscription — staff do NOT get a free pass here (unlike the library-content seam
-- in 0016), because the personalised program IS the athlete's paid plan; if there's
-- no live Tier 1, there is no program to see or build.
--
-- SECURITY DEFINER so it can call the revoked athlete_entitled() (a definer runs as
-- its owner, which retains EXECUTE) — the same indirection 0016 uses to keep
-- current_user_entitled callable from RLS while athlete_entitled stays internal.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_can_manage_entitled_athlete(
  p_athlete_id uuid
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
  v_club uuid;
begin
  if v_uid is null then
    return false;
  end if;

  select role, club_id into v_role, v_club
  from public.profiles where id = v_uid;

  -- Management check mirrors complete_drill / athletes_update: a platform admin,
  -- a coach/club_admin in the athlete's club, the managing parent, or the linked
  -- athlete themselves.
  if v_role <> 'admin' then
    if not exists (
      select 1 from public.athletes a
      where a.id = p_athlete_id
        and a.club_id = v_club
        and (
          v_role in ('coach', 'club_admin')
          or a.parent_id = v_uid
          or a.profile_id = v_uid
        )
    ) then
      return false;
    end if;
  end if;

  return public.athlete_entitled(p_athlete_id, 'tier1');
end;
$$;

grant execute on function public.current_user_can_manage_entitled_athlete(uuid)
  to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Recreate the program / program_drills SELECT policies so a personalised
--    (athlete-targeted) program is only visible to the people who manage that
--    athlete AND only while the athlete is Tier 1 entitled (the RLS paid gate).
--    Cohort Sets (athlete_id IS NULL) keep their existing club-scoped visibility.
-- ---------------------------------------------------------------------------

drop policy programs_select on public.programs;
create policy programs_select on public.programs
  for select using (
    case
      when athlete_id is null then (
        club_id is null
        or club_id = public.current_club_id()
        or public.current_role() = 'admin'
      )
      else public.current_user_can_manage_entitled_athlete(athlete_id)
    end
  );

drop policy program_drills_select on public.program_drills;
create policy program_drills_select on public.program_drills
  for select using (
    case
      when athlete_id is null then (
        club_id is null
        or club_id = public.current_club_id()
        or public.current_role() = 'admin'
      )
      else public.current_user_can_manage_entitled_athlete(athlete_id)
    end
  );

-- ---------------------------------------------------------------------------
-- 4. complete_drill — recreated to keep the free Matchday Set logic correct now
--    that athlete-targeted programs share the programs table.
--
-- Reproduced verbatim from the 0015 version with TWO changes:
--   (a) The Set-detection loop gains `and p.athlete_id is null` so it only ever
--       counts the cohort Matchday Set. Without this, a personalised program would
--       (i) leak across the whole cohort (its drills would count toward a "Set" for
--       every athlete in that sport/age group) and (ii) bank the +50 Set bonus.
--       Personalised-program progress is tracked in the app from drill XP events;
--       it deliberately does NOT trigger the Set bonus (the FREE Set stays separate).
--   (b) Restores `or v_athlete.profile_id = v_uid` in the authorisation check. 0010
--       added it so a linked 13+ athlete can log their OWN sessions; the 0015
--       recreate (built from the 0006 base) accidentally dropped it. The recommender
--       is explicitly used by 13+ athletes on their own login, so it's restored here.
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
  -- club, the managing parent, the linked athlete themselves, or a platform admin.
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

  -- Matchday Challenge (the Set): for every live COHORT Set this week (athlete_id
  -- IS NULL — personalised recommended programs are excluded) that contains the
  -- drill just logged, targets this athlete's cohort, is visible to their club,
  -- and isn't already banked — check whether the whole Set is now done.
  for v_prog in
    select p.* from public.programs p
    where p.athlete_id is null
      and p.sport = v_athlete.sport
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
-- 5. recommend_program — the RPC-as-seam that persists an AI-built program.
--
-- The app calls Claude (server-side) to SELECT & ORDER drills, then hands the
-- ordered drill ids here. This RPC is the authoritative gate and the persistence
-- step. It (1) authorises the caller can manage the athlete, (2) checks the athlete
-- holds Tier 1 (the paid gate — RLS-refuse if not), (3) validates EVERY drill id is
-- a real drill visible to the athlete's club (the youth-safety guarantee: only
-- approved library drills, never invented content), then (4) supersedes any prior
-- recommended program for that athlete and writes the new one. SECURITY DEFINER so
-- it can read subscriptions / write across RLS; self-authorises like complete_drill.
-- ---------------------------------------------------------------------------

create or replace function public.recommend_program(
  p_athlete_id uuid,
  p_goal       text,
  p_title      text,
  p_summary    text,
  p_drill_ids  uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role;
  v_club    uuid;
  v_athlete public.athletes;
  v_week    date := date_trunc('week', current_date)::date;
  v_prog_id uuid;
  v_count   integer := coalesce(array_length(p_drill_ids, 1), 0);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role, club_id into v_role, v_club
  from public.profiles where id = v_uid;

  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Athlete not found';
  end if;

  -- (1) Authorisation — same management rule as complete_drill.
  if not (
    v_role = 'admin'
    or (
      v_athlete.club_id = v_club
      and (
        v_role in ('coach', 'club_admin')
        or v_athlete.parent_id = v_uid
        or v_athlete.profile_id = v_uid
      )
    )
  ) then
    raise exception 'Not allowed to build a program for this athlete';
  end if;

  -- (2) Paid gate — per-athlete entitlement. RLS would hide the result anyway;
  -- refusing here makes the boundary explicit and gives the app a clean error.
  if not public.athlete_entitled(p_athlete_id, 'tier1') then
    raise exception 'This athlete needs a Tier 1 membership for a personalised program';
  end if;

  -- Shape check on the drill list (the app also clamps this).
  if v_count < 1 or v_count > 8 then
    raise exception 'A program needs between 1 and 8 drills';
  end if;

  -- (3) Youth-safety: every id must be a real drill visible to the athlete's club
  -- (global or club-owned). The AI only ever orders approved library drills.
  if exists (
    select 1 from unnest(p_drill_ids) as t(drill_id)
    where not exists (
      select 1 from public.drills d
      where d.id = t.drill_id
        and (d.club_id is null or d.club_id = v_athlete.club_id)
    )
  ) then
    raise exception 'One or more drills are not available for this athlete';
  end if;

  -- (4) One active personalised program per athlete: supersede the previous one.
  -- (Cascades to its program_drills; the athlete's XP-event history is untouched.)
  delete from public.programs
  where athlete_id = p_athlete_id and source = 'recommended';

  insert into public.programs
    (club_id, sport, age_group, title, description, week_start, athlete_id, source, goal)
  values (
    v_athlete.club_id, v_athlete.sport, v_athlete.age_group,
    p_title, p_summary, v_week, p_athlete_id, 'recommended', p_goal
  )
  returning id into v_prog_id;

  insert into public.program_drills (program_id, drill_id, position, club_id, athlete_id)
  select v_prog_id, t.drill_id, t.ord, v_athlete.club_id, p_athlete_id
  from unnest(p_drill_ids) with ordinality as t(drill_id, ord);

  return v_prog_id;
end;
$$;

-- Lock execution to authenticated callers (the function self-authorises); revoke
-- the default PUBLIC grant + anon (same defensive pattern as the other RPCs).
revoke execute on function public.recommend_program(uuid, text, text, text, uuid[])
  from public, anon;
grant execute on function public.recommend_program(uuid, text, text, text, uuid[])
  to authenticated;


-- ############################################################################
-- # PART C — TEST-MODE ENTITLEMENT SEED  (no Stripe required)
-- ############################################################################
-- Grants a live Tier 1 subscription to EVERY athlete that doesn't already have
-- one, so the gate athlete_entitled(athlete,'tier1') passes and Weekly Programs
-- unlock. This is a TEST-MODE shortcut — in production these rows are written by
-- the Stripe webhook, not by hand.
--
-- Idempotent: re-run it any time you add a new kid; it skips athletes that
-- already hold a live plan. To grant only specific kids, add a WHERE on
-- a.full_name (see the commented variant below).

insert into public.subscriptions (athlete_id, club_id, payer_id, tier, status)
select a.id, a.club_id, a.parent_id, 'tier1', 'active'
from public.athletes a
where not exists (
  select 1 from public.subscriptions s
  where s.athlete_id = a.id
    and s.status in ('trialing', 'active', 'past_due')
);

-- Scoped variant — grant only named athletes instead of all of them:
--   insert into public.subscriptions (athlete_id, club_id, payer_id, tier, status)
--   select a.id, a.club_id, a.parent_id, 'tier1', 'active'
--   from public.athletes a
--   where a.full_name in ('Kid One', 'Kid Two')
--     and not exists (
--       select 1 from public.subscriptions s
--       where s.athlete_id = a.id and s.status in ('trialing','active','past_due')
--     );

-- TO REVOKE test entitlement later (drops everyone back to free) before you wire
-- real Stripe — run just this line:
--   delete from public.subscriptions where stripe_subscription_id is null;
-- (Real Stripe-created rows always have a stripe_subscription_id, so this only
--  removes the hand-seeded test rows.)
