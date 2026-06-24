# Benchmark & Verification Engine — the Tier-2 data moat

**Status:** design sketch (not built). This is the **Tier-2** paid feature and the durable asset
of the operating model (CLAUDE.md → "Verification engine = the data moat"). It is **gated behind
Payments** — do not build it before the entitlement seam exists. First sport is **basketball**
(the QLD pilot).

## The idea in one line

A standardised, sport-specific **benchmark battery** is captured **on video**, validated by
**automation + coach sampling** (human-in-the-loop, like every other piece of COLT), and reported
as **percentiles vs age/position peers over time**. The output is a **verified development
profile** (a player card) — credible longitudinal data that attracts elite pathways (rep teams,
academies, scouts), which pulls in the next wave of paying families. Gamification is the
*data-capture engine* that drives logging; the verified profile is the *product*.

## Why it's the moat (and why it's Tier-2)

- **Free / Tier-1 data is self-reported** (an athlete logs a drill → XP). Useful for engagement,
  not credible to a scout.
- **Tier-2 data is *verified*** — a standardised test, captured on video, checked, and ranked
  against peers. That credibility is the thing families pay $19.99 for and the thing that
  compounds: more verified athletes → better percentile baselines → more credible profiles.
- Verification has real operational cost (storage, automation, coach time), which is exactly why
  it sits behind the higher tier.

## Dependencies (build these first)

1. **Payments + entitlement seam** — benchmark capture/results are visible only to T2 entitlements.
   The engine consumes the same RLS entitlement gate the recommender will.
2. **Video capture infra** — reuses the async pattern designed in `drill-video-pipeline.md`
   (upload → detached processing → Supabase Storage → human review). A benchmark *attempt* is the
   same shape as a drill clip, plus a measured result and a verification verdict.

## Data model sketch

```sql
-- A standardised test in the battery (per sport; optional age_group / position scoping).
-- club_id NULL = platform/global definition (the standard battery); admins curate it.
create table public.benchmarks (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs (id) on delete cascade, -- NULL = global standard
  sport       public.sport not null,
  age_group   public.age_group,                 -- NULL = all ages
  key         text not null,                     -- 'ft_pct', 'lane_agility_s', 'vertical_cm'
  label       text not null,                     -- 'Free-throw %', 'Lane Agility', 'Vertical Jump'
  unit        text not null,                     -- '%', 's', 'cm'
  direction   smallint not null default 1,       -- 1 = higher is better, -1 = lower is better (time)
  protocol    text not null,                     -- how to perform/film it (shown to the athlete)
  created_at  timestamptz not null default now(),
  unique (sport, key)
);

-- One athlete's attempt at one benchmark: a measured value + the video + a verdict.
create type public.verification_status as enum
  ('submitted','auto_checked','verified','rejected');

create table public.benchmark_results (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes (id) on delete cascade,
  club_id       uuid not null references public.clubs (id) on delete cascade, -- denormalised, RLS
  benchmark_id  uuid not null references public.benchmarks (id),
  value         numeric not null,                -- the measured result
  video_url     text,                            -- the capture (Supabase Storage; see video doc)
  status        public.verification_status not null default 'submitted',
  verified_by   uuid references auth.users (id), -- the sampling coach, when verified
  note          text,
  captured_at   timestamptz not null default now(),
  verified_at   timestamptz
);
create index benchmark_results_athlete_idx on public.benchmark_results (athlete_id);
create index benchmark_results_cohort_idx
  on public.benchmark_results (benchmark_id, status);
```

**RLS:** `benchmarks` follow the global/club-curated pattern (read by all authenticated, write
admin/coach per scope). `benchmark_results` are club-scoped like `xp_events` **and additionally
gated to a Tier-2 entitlement** for capture/visibility (the entitlement seam from Payments). Writes
that flip `status → verified` go through a SECURITY DEFINER RPC so the verdict stays authoritative
(same discipline as `complete_drill` / `approveDraftDrill`).

## Capture → verify → percentile

```
athlete records the test ─► upload (async, like drill video) ─► auto-check
   (value + video)                                              (range/format sanity, optional CV)
                                                                       │
                                              coach SAMPLES a subset ──► verify / reject
                                                                       │  (human-in-the-loop)
                                                          status = 'verified'
                                                                       │
                                  percentile vs age/position peers (computed from verified rows)
                                                                       ▼
                                            development profile / player card (the deliverable)
```

- **Automation does the volume, coaches sample for integrity** — not every clip is watched, but
  enough are to keep the dataset honest. Only `verified` results count toward percentiles.
- **Percentiles** are computed per `(benchmark, age_group[, position])` cohort over `verified`
  results — a `security_invoker` view (like `ladder`), or a periodically-materialised table once
  volume grows. Report current percentile + trend over time.

## Basketball starter battery (validate with the pilot's expert coach)

Examples to seed for the pilot — **confirm protocols/values with the vetted coach before relying
on them**; do not invent norms:

| key | label | unit | direction |
|---|---|---|---|
| `ft_pct` | Free-throw % (20 attempts) | % | higher |
| `lane_agility_s` | Lane agility | s | lower |
| `three_quarter_sprint_s` | ¾-court sprint | s | lower |
| `vertical_cm` | Standing vertical | cm | higher |
| `spot_up_makes` | 60-second spot-up makes | count | higher |

Age-band each one (U10/U13/U16) so percentiles compare like-for-like.

## Youth safety & consent (non-negotiable)

- Benchmark video is **footage of minors** → explicit **media consent** captured per athlete before
  any upload; restricted visibility (the athlete, their guardian, club staff, sampling coach).
- All coach contact is **club-mediated** — no 1:1 DMs/video; the sampling coach holds a WWCC +
  child-safe training (per the operating model). The coach is a *supplier*, not in the parent
  relationship.
- Storage access via **signed URLs**, never public (stricter than the free drill library).

## Build order (when Payments exists)

1. Migration: `benchmarks` + `benchmark_results` + `verification_status` enum; add to `types.ts`;
   seed the basketball battery (admin/expert-curated).
2. Capture UI + upload (reuse the `drill-video-pipeline` async upload/Storage path).
3. Auto-check + the coach **sampling/verify** queue (SECURITY DEFINER verify RPC).
4. Percentile view/computation per cohort.
5. **Development profile / player card** UI — gated to Tier-2 entitlement; the parent-facing proof
   of value.
6. Consent capture + signed-URL access controls.

## KPI / flywheel

This is the **Tier-1 → Tier-2 upgrade** lever (the pilot's second headline KPI). The flywheel:
verified longitudinal data → credible player cards → elite-pathway interest → more paying families
→ richer percentile baselines. Clone the battery sport-by-sport only after the basketball pilot
proves the upgrade economics.
