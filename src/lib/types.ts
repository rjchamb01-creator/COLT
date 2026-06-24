// Domain types for COLT.
//
// `Database` mirrors supabase/migrations/0001_init.sql closely enough to give the
// Supabase client end-to-end typing. Once a real Supabase project exists, this can
// be replaced by the output of `supabase gen types typescript`.

export type UserRole = "admin" | "club_admin" | "coach" | "parent" | "athlete";
export type Sport = "rugby_league" | "soccer" | "basketball";
export type AgeGroup = "u10" | "u13" | "u16";

// Gamification (the moat). Brand vocabulary: XP → Tiers → Ladder → Caps → Heat.
export type XpSource = "drill" | "cap" | "bonus";
// Tier progression keys; labels live in TIER_LABELS / src/lib/gamification.ts.
export type Tier = "rookie" | "rising" | "starter" | "pro" | "elite" | "legend";

// NOTE: these are `type` aliases, not `interface`s, on purpose. supabase-js's
// `GenericTable` requires `Row extends Record<string, unknown>`, and only object
// type aliases satisfy that — `interface` types are not assignable to
// `Record<string, unknown>`, which would collapse query result types to `never`.
export type Club = {
  id: string;
  name: string;
  join_code: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  club_id: string | null;
  created_at: string;
};

export type Athlete = {
  id: string;
  club_id: string;
  parent_id: string | null;
  full_name: string;
  sport: Sport;
  age_group: AgeGroup;
  created_at: string;
  // Player accounts: the athlete's own login once they claim their record
  // (null = unclaimed/managed-only). claim_token is the secret in the invite
  // link, cleared on claim (single-use).
  profile_id: string | null;
  claim_token: string | null;
};

// Read-only preview shown on the public /claim page (peek_athlete_invite RPC).
export type AthleteInvitePreview = {
  full_name: string;
  sport: Sport;
  age_group: AgeGroup;
  club_name: string;
};

// A training drill in the library. club_id null = platform/global content visible
// to every club; non-null = content authored by and scoped to a single club.
// difficulty (1=intro, 2=building, 3=advanced) is optional — groundwork for the
// Phase-2 AI Program Recommender's progression/sequencing.
export type Drill = {
  id: string;
  club_id: string | null;
  sport: Sport;
  age_group: AgeGroup;
  title: string;
  description: string;
  duration_min: number;
  video_url: string | null;
  difficulty: number | null;
  // Phase 2 paid gate: a premium ("deeper / position-specific") drill is only
  // returned by RLS to entitled callers (Tier 1+). false = the free library.
  is_premium: boolean;
  created_at: string;
};

// A trainable skill/goal in the taxonomy (acceleration, first_touch, defence…).
// sport null = applies to both MVP sports; non-null = sport-specific. `key` is
// the stable machine key used by the AI-draft tool and URL filters.
export type Skill = {
  id: string;
  key: string;
  label: string;
  sport: Sport | null;
  created_at: string;
};

// The drill ↔ skill join. club_id is denormalised from the drill (null = global)
// so the standard club-scoped RLS applies without a join — mirrors program_drills.
export type DrillSkill = {
  id: string;
  drill_id: string;
  skill_id: string;
  club_id: string | null;
};

// Append-only XP ledger row. XP earned from a drill = the drill's duration_min.
export type XpEvent = {
  id: string;
  athlete_id: string;
  club_id: string;
  source: XpSource;
  drill_id: string | null;
  xp: number;
  note: string | null;
  created_at: string;
};

// An earnable achievement. club_id null = platform/global cap.
export type Cap = {
  id: string;
  club_id: string | null;
  code: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  created_at: string;
};

// One row the first time an athlete earns a cap.
export type AthleteCap = {
  id: string;
  athlete_id: string;
  club_id: string;
  cap_id: string;
  earned_at: string;
};

// How a program is targeted. "matchday" = the FREE global/club cohort Set ("the
// Set"); "recommended" = a PAID, AI-built, athlete-targeted personalised program
// (the Tier 1 Weekly Programs lever). The two share the table but never interfere
// (complete_drill's Set-bonus detection ignores athlete-targeted programs).
export type ProgramSource = "matchday" | "recommended";

// A program targeted at a cohort (the weekly Matchday Set) or, when athlete_id is
// set, an individual athlete (a personalised recommended program). club_id null =
// platform/global Set visible to every club; non-null = club-specific. week_start
// is the Monday of the week it is live. goal = the stated goal a recommended
// program was built for (null for cohort Sets).
export type Program = {
  id: string;
  club_id: string | null;
  sport: Sport;
  age_group: AgeGroup;
  title: string;
  description: string;
  week_start: string;
  // null = cohort Set; non-null = personalised recommended program for that athlete.
  athlete_id: string | null;
  source: ProgramSource;
  goal: string | null;
  created_at: string;
};

// One drill in a program's ordered list. club_id / athlete_id are denormalised
// from the program (null = global / cohort) for the standard club-scoped RLS
// pattern without a join.
export type ProgramDrill = {
  id: string;
  program_id: string;
  drill_id: string;
  position: number;
  club_id: string | null;
  athlete_id: string | null;
};

// One row the first time an athlete finishes a Set (append-only).
export type ProgramCompletion = {
  id: string;
  athlete_id: string;
  club_id: string;
  program_id: string;
  completed_at: string;
};

// Squad Hub — the free collective engagement layer (club comms + schedule).
// One club == one Squad for the MVP, so both are club-scoped (club_id NOT NULL;
// no global/platform rows, unlike drills/caps/programs).

// A post from the club/coach to the Squad.
export type Announcement = {
  id: string;
  club_id: string;
  author_id: string | null;
  title: string;
  body: string;
  created_at: string;
};

// A scheduled training session. sport / age_group are optional cohort targeting
// (null = the whole Squad). Schedule-only — no attendance/RSVP (Phase 2 paid).
export type Event = {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  sport: Sport | null;
  age_group: AgeGroup | null;
  created_at: string;
};

// Engagement instrumentation — Phase 1 telemetry on which features people lean
// on (the data that decides where the Phase 2 paywall goes). Platform-admin read
// only; never a parent/club-facing dashboard (that's the paid Phase 2 lever).
// The trackable features (dashboard pages). Keep in sync with the TrackView
// calls mounted on each page.
export type Feature =
  | "dashboard"
  | "squad"
  | "training"
  | "challenge"
  | "ladder"
  | "athletes"
  | "coach"
  | "library"
  | "billing"
  | "program";

export type ActivityEvent = {
  id: string;
  club_id: string;
  profile_id: string;
  role: UserRole;
  feature: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

// Payments & entitlements (Phase 2). Two paid tiers; `free` is the implicit tier
// of any athlete with no live subscription. Conversion is per-athlete, the payer
// is the parent, and revenue is split 70% COLT / 30% the referring club.
export type SubscriptionTier = "free" | "tier1" | "tier2";

// Mirrors Stripe's Subscription.status. "Live" (entitled) = trialing | active.
export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

// One row per athlete subscription. club_id = the referring club (70/30 target).
export type Subscription = {
  id: string;
  athlete_id: string;
  club_id: string;
  payer_id: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

// The 70/30 revenue ledger — one row per paid Stripe invoice. Amounts are in the
// smallest currency unit (cents). club_share + colt_share = amount_total.
export type SubscriptionInvoice = {
  id: string;
  subscription_id: string | null;
  athlete_id: string | null;
  club_id: string;
  payer_id: string | null;
  tier: SubscriptionTier;
  stripe_invoice_id: string;
  amount_total: number;
  currency: string;
  club_share_bps: number;
  club_share: number;
  colt_share: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

// Result of the record_coach_message RPC — per-user rate limit for the AI Coach.
export type CoachRateResult = {
  allowed: boolean;
  count: number;
  limit: number;
  window_seconds: number;
};

// A row of the `ladder` view: total XP per athlete within a club.
export type LadderRow = {
  athlete_id: string;
  club_id: string;
  full_name: string;
  sport: Sport;
  age_group: AgeGroup;
  total_xp: number;
  sessions: number;
};

// Summary returned by the complete_drill RPC — drives the level-up moment.
export type CompleteDrillResult = {
  xp_gained: number;
  total_xp: number;
  tier: Tier;
  tier_changed: boolean;
  heat: number;
  new_caps: { code: string; name: string; icon: string }[];
  drill_title: string;
  // Matchday Challenge ("the Set"): true when logging this drill finished the
  // athlete's live weekly Set, banking set_bonus_xp bonus XP (0 otherwise).
  set_completed: boolean;
  set_bonus_xp: number;
};

// Human-readable labels for enum values (used in UI).
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Platform Admin",
  club_admin: "Club Admin",
  coach: "Coach",
  parent: "Parent / Guardian",
  athlete: "Athlete",
};

export const SPORT_LABELS: Record<Sport, string> = {
  rugby_league: "Rugby League",
  soccer: "Soccer",
  basketball: "Basketball",
};

// The MVP sports, in display order. Single source of truth — import this in UI
// sport pickers/filters instead of re-listing the literals (so a new sport is a
// one-line change here). Keep in sync with the `sport` DB enum.
export const SPORTS: Sport[] = ["rugby_league", "soccer", "basketball"];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  u10: "Under 10",
  u13: "Under 13",
  u16: "Under 16",
};

// Paid tiers (the curated-expert refinement). Prices are the proposed starting
// points to validate in-pilot; the cents value is what Stripe charges.
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  tier1: "Tier 1 — The Training Edge",
  tier2: "Tier 2 — Like a Personal Coach",
};

export const TIER_PRICE_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  tier1: "$9.99/mo",
  tier2: "$19.99/mo",
};

// The paid tiers, in display order (free is the implicit no-subscription tier).
export const PAID_TIERS: Exclude<SubscriptionTier, "free">[] = ["tier1", "tier2"];

// Minimal Database shape for the typed Supabase client.
// NOTE: use `Record<never, never>` (an empty type) for Views/CompositeTypes, not
// `Record<string, never>`. The latter adds a `[key: string]: never` index
// signature that supabase-js intersects with `Tables`, collapsing every table
// row type to `never`. The `Relationships` field is also required by the generics.
type Empty = Record<never, never>;
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
type View<T> = { Row: T; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      clubs: Table<Club>;
      profiles: Table<Profile>;
      athletes: Table<Athlete>;
      drills: Table<Drill>;
      skills: Table<Skill>;
      drill_skills: Table<DrillSkill>;
      xp_events: Table<XpEvent>;
      caps: Table<Cap>;
      athlete_caps: Table<AthleteCap>;
      programs: Table<Program>;
      program_drills: Table<ProgramDrill>;
      program_completions: Table<ProgramCompletion>;
      announcements: Table<Announcement>;
      events: Table<Event>;
      activity_events: Table<ActivityEvent>;
      subscriptions: Table<Subscription>;
      subscription_invoices: Table<SubscriptionInvoice>;
    };
    Views: {
      ladder: View<LadderRow>;
    };
    Functions: {
      current_club_id: { Args: Empty; Returns: string | null };
      current_role: { Args: Empty; Returns: UserRole };
      create_club: { Args: { p_name: string }; Returns: Club };
      join_club: { Args: { p_code: string }; Returns: Club };
      tier_for_xp: { Args: { p_xp: number }; Returns: Tier };
      athlete_heat: { Args: { p_athlete_id: string }; Returns: number };
      complete_drill: {
        Args: { p_athlete_id: string; p_drill_id: string };
        Returns: CompleteDrillResult;
      };
      record_coach_message: { Args: Empty; Returns: CoachRateResult };
      create_athlete_invite: { Args: { p_athlete_id: string }; Returns: string };
      peek_athlete_invite: {
        Args: { p_token: string };
        Returns: AthleteInvitePreview | null;
      };
      claim_athlete: {
        Args: { p_token: string };
        Returns: { athlete_id: string; club_id: string };
      };
      // Builds a fresh global Matchday Set per cohort for the current week
      // (idempotent). Returns the number of cohorts a Set was created for.
      rotate_weekly_sets: { Args: Empty; Returns: number };
      // Entitlement seam: is the CURRENT user entitled to at least p_min_tier?
      // Drives the premium-library RLS and the in-app paid/locked UI state.
      current_user_entitled: {
        Args: { p_min_tier?: SubscriptionTier };
        Returns: boolean;
      };
      // How many premium drills the caller could unlock (0 once entitled) — the
      // upsell teaser count, without leaking the content RLS is hiding.
      locked_premium_count: { Args: Empty; Returns: number };
      // Per-athlete gate for the paid Weekly Programs surface: true iff the caller
      // can manage the athlete AND that athlete holds Tier 1. Drives the
      // personalised-program RLS and the in-app recommender/upsell state.
      current_user_can_manage_entitled_athlete: {
        Args: { p_athlete_id: string };
        Returns: boolean;
      };
      // Persist an AI-built personalised program (Tier 1). Validates management +
      // entitlement + that every drill id is a real, club-visible drill, supersedes
      // the athlete's prior recommended program, and returns the new program id.
      recommend_program: {
        Args: {
          p_athlete_id: string;
          p_goal: string;
          p_title: string;
          p_summary: string;
          p_drill_ids: string[];
        };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      sport: Sport;
      age_group: AgeGroup;
      xp_source: XpSource;
      subscription_tier: SubscriptionTier;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: Empty;
  };
}
