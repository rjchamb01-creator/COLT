// Gamification logic (the moat) — pure helpers shared by the UI.
// Brand vocabulary: XP → Tiers → The Ladder → Caps → Heat (see BRAND.md).
//
// XP thresholds here are the source of truth for the UI and MUST stay in sync
// with public.tier_for_xp() in supabase/migrations/..._gamification.sql.

import type { Tier, XpEvent } from "@/lib/types";

export type TierDef = {
  key: Tier;
  label: string;
  /** Minimum total XP to hold this tier. */
  min: number;
};

// Rookie → Rising → Starter → Pro → Elite → Legend.
export const TIERS: TierDef[] = [
  { key: "rookie", label: "Rookie", min: 0 },
  { key: "rising", label: "Rising", min: 100 },
  { key: "starter", label: "Starter", min: 300 },
  { key: "pro", label: "Pro", min: 700 },
  { key: "elite", label: "Elite", min: 1500 },
  { key: "legend", label: "Legend", min: 3000 },
];

export const TIER_LABELS: Record<Tier, string> = Object.fromEntries(
  TIERS.map((t) => [t.key, t.label]),
) as Record<Tier, string>;

/** The tier an athlete holds at a given total XP. */
export function tierForXp(xp: number): TierDef {
  let current = TIERS[0];
  for (const t of TIERS) {
    if (xp >= t.min) current = t;
  }
  return current;
}

export type TierProgress = {
  tier: TierDef;
  next: TierDef | null;
  /** XP banked inside the current tier band. */
  intoTier: number;
  /** XP span of the current tier band (Infinity at the top tier). */
  bandSize: number;
  /** XP still needed to reach the next tier (0 at the top tier). */
  toNext: number;
  /** 0–1 fill of the current tier band (1 at the top tier). */
  fraction: number;
};

/** Progress within the current tier — drives the climb / XP bar. */
export function tierProgress(xp: number): TierProgress {
  const tier = tierForXp(xp);
  const idx = TIERS.findIndex((t) => t.key === tier.key);
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;

  if (!next) {
    return { tier, next: null, intoTier: xp - tier.min, bandSize: Infinity, toNext: 0, fraction: 1 };
  }

  const bandSize = next.min - tier.min;
  const intoTier = xp - tier.min;
  return {
    tier,
    next,
    intoTier,
    bandSize,
    toNext: Math.max(0, next.min - xp),
    fraction: Math.min(1, intoTier / bandSize),
  };
}

/**
 * Heat = consecutive-day training streak from a list of XP events, ending today
 * (or yesterday, so it doesn't read as cold until a full day is missed). Buckets
 * by UTC date to match public.athlete_heat() in the migration.
 */
export function computeHeat(events: Pick<XpEvent, "source" | "created_at">[]): number {
  const days = new Set<string>();
  for (const e of events) {
    if (e.source === "drill") days.add(e.created_at.slice(0, 10)); // YYYY-MM-DD (UTC)
  }
  if (days.size === 0) return 0;

  const today = new Date();
  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Anchor at today, or yesterday if today has no activity.
  if (!days.has(toKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(toKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(toKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Total XP from a ledger. */
export function totalXp(events: Pick<XpEvent, "xp">[]): number {
  return events.reduce((sum, e) => sum + e.xp, 0);
}

/** "1,240" — XP and big numbers read better grouped. */
export function formatXp(xp: number): string {
  return xp.toLocaleString("en-US");
}
