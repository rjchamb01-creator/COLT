// Presentational gamification components, in brand vocabulary.
// Tier badge, XP "climb" bar, Heat flame, and Badges — Signal Red is the single
// accent, used sparingly for level-ups / Heat / reward moments (BRAND.md).
// (Component/type names keep "Cap" — UI copy says "Badge"; see BRAND.md.)

import type { Tier } from "@/lib/types";
import { TIER_LABELS, tierProgress, formatXp } from "@/lib/gamification";

// Tier colour ramp — muted → Signal Red as you climb. Signal marks "Pro and above".
const TIER_STYLES: Record<Tier, string> = {
  rookie: "border-white/20 text-bone/70",
  rising: "border-steel/50 text-steel",
  starter: "border-steel text-steel",
  pro: "border-signal/60 text-signal",
  elite: "border-signal text-signal",
  legend: "border-signal text-signal",
};

export function TierBadge({
  tier,
  className = "",
}: {
  tier: Tier;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-display text-xs tracking-wide ${TIER_STYLES[tier]} ${className}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

// XP progress through the current tier — the "climb". Signal fill with an
// upward-chevron texture, plus the to-next-tier copy.
export function XpBar({ xp }: { xp: number }) {
  const p = tierProgress(xp);
  const pct = Math.round(p.fraction * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-display text-base text-bone">{formatXp(xp)} XP</span>
        <span className="text-steel">
          {p.next
            ? `${formatXp(p.toNext)} XP to ${TIER_LABELS[p.next.key]}`
            : "Top of the tiers — Legend"}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="climb-fill absolute inset-y-0 left-0 rounded-full bg-signal transition-[width] duration-500"
          style={{ width: `${Math.max(pct, p.next ? 4 : 100)}%` }}
        />
      </div>
    </div>
  );
}

// Heat — consecutive-day streak. Signal "on fire" once it's burning.
export function StreakFlame({
  heat,
  className = "",
}: {
  heat: number;
  className?: string;
}) {
  const hot = heat >= 3;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        hot
          ? "border-signal/60 bg-signal/10 text-signal"
          : "border-white/15 text-bone/60"
      } ${className}`}
      title={`${heat}-day Heat`}
    >
      <span aria-hidden>{hot ? "🔥" : "•"}</span>
      {heat > 0 ? `${heat}-day Heat` : "No Heat yet"}
    </span>
  );
}

// A single earned cap chip.
export function CapBadge({
  icon,
  name,
  className = "",
}: {
  icon: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-bone/80 ${className}`}
      title={name}
    >
      <span aria-hidden>{icon}</span>
      {name}
    </span>
  );
}
