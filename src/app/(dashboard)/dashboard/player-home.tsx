import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type Athlete,
  type AthleteCap,
  type Cap,
  type Drill,
  type LadderRow,
  type Program,
  type ProgramCompletion,
  type ProgramDrill,
  type XpEvent,
} from "@/lib/types";
import { computeHeat, tierForXp, totalXp } from "@/lib/gamification";
import { buildAthleteSet } from "@/lib/challenge";
import { TierBadge, XpBar, StreakFlame, CapBadge } from "@/components/gamification";
import { TrackView } from "@/components/track-view";

// The athlete's own "me" view — what a 12+ player sees when they log in on their
// phone. Focused on THEM (their tier/XP/Heat/caps, their Set, their ladder rank),
// not the club-wide athlete list a parent/coach sees.
export async function PlayerHome({
  userId,
  monday,
}: {
  userId: string;
  monday: string;
}) {
  const supabase = await createClient();

  // The athlete record linked to this login.
  const { data: athleteRows } = await supabase
    .from("athletes")
    .select("*")
    .eq("profile_id", userId)
    .limit(1);
  const athlete = (athleteRows?.[0] as Athlete | undefined) ?? null;

  if (!athlete) {
    return (
      <div className="mx-auto max-w-2xl">
        <TrackView feature="dashboard" />
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          We couldn&apos;t find your player profile. Ask your coach or parent to
          send you a fresh invite link.
        </p>
      </div>
    );
  }

  const [evRes, earnedRes, capRes, progRes, ladRes] = await Promise.all([
    supabase.from("xp_events").select("*").eq("athlete_id", athlete.id),
    supabase.from("athlete_caps").select("*").eq("athlete_id", athlete.id),
    supabase.from("caps").select("*"),
    supabase.from("programs").select("*").eq("week_start", monday),
    supabase.from("ladder").select("*"),
  ]);
  const events = (evRes.data as XpEvent[]) ?? [];
  const earned = (earnedRes.data as AthleteCap[]) ?? [];
  const caps = (capRes.data as Cap[]) ?? [];
  const programs = (progRes.data as Program[]) ?? [];
  const ladder = (ladRes.data as LadderRow[]) ?? [];

  // This week's Set.
  const programIds = programs.map((p) => p.id);
  let programDrills: ProgramDrill[] = [];
  let completions: ProgramCompletion[] = [];
  const drillsById = new Map<string, Drill>();
  if (programIds.length > 0) {
    const [pdRes, complRes] = await Promise.all([
      supabase.from("program_drills").select("*").in("program_id", programIds),
      supabase
        .from("program_completions")
        .select("*")
        .in("program_id", programIds)
        .eq("athlete_id", athlete.id),
    ]);
    programDrills = (pdRes.data as ProgramDrill[]) ?? [];
    completions = (complRes.data as ProgramCompletion[]) ?? [];
    const drillIds = [...new Set(programDrills.map((pd) => pd.drill_id))];
    if (drillIds.length > 0) {
      const { data } = await supabase.from("drills").select("*").in("id", drillIds);
      for (const d of (data as Drill[]) ?? []) drillsById.set(d.id, d);
    }
  }
  const weekEvents = events.filter((e) => e.created_at >= monday);
  const set = buildAthleteSet(
    athlete,
    programs,
    programDrills,
    drillsById,
    weekEvents,
    completions,
  );

  const xp = totalXp(events);
  const tier = tierForXp(xp);
  const heat = computeHeat(events);
  const capsById = new Map(caps.map((c) => [c.id, c]));
  const wonCaps = earned
    .map((ac) => capsById.get(ac.cap_id))
    .filter((c): c is Cap => Boolean(c));

  // Ladder rank within the club.
  const sorted = [...ladder].sort((a, b) => b.total_xp - a.total_xp);
  const rank = sorted.findIndex((r) => r.athlete_id === athlete.id) + 1;
  const firstName = athlete.full_name.split(" ")[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <TrackView feature="dashboard" />

      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-bone">
            Let&apos;s go, {firstName}
          </h1>
          <p className="mt-1 text-bone/60">
            {SPORT_LABELS[athlete.sport]} · {AGE_GROUP_LABELS[athlete.age_group]} —
            your XP, your tier, your ladder. Go take it.
          </p>
        </div>
        <StreakFlame heat={heat} />
      </section>

      {/* Hero: tier + the climb. */}
      <section className="rounded-2xl border border-signal/25 bg-signal/[0.04] p-5">
        <div className="mb-3 flex items-center justify-between">
          <TierBadge tier={tier.key} className="text-sm" />
          <span className="text-sm text-bone/70">
            {rank > 0
              ? `#${rank} of ${sorted.length} on the Ladder`
              : "Log a session to hit the Ladder"}
          </span>
        </div>
        <XpBar xp={xp} />
        {wonCaps.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {wonCaps.map((c) => (
              <CapBadge key={c.id} icon={c.icon} name={c.name} />
            ))}
          </div>
        )}
      </section>

      {/* This week's Set. */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-signal">
              This Week&apos;s Set
            </div>
            <p className="mt-1 text-sm text-bone/70">
              {set === null
                ? "No Set for your cohort yet — a fresh one drops next week. Keep your Heat alive."
                : set.completed
                  ? "Set complete — bonus banked. Same time next week. 🏆"
                  : `Finish the Set to bank bonus XP. ${set.doneCount}/${set.total} done.`}
            </p>
          </div>
          <Link
            href="/dashboard/challenge"
            className="inline-flex shrink-0 items-center rounded-full bg-signal px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.03]"
          >
            {set && !set.completed ? "Finish the Set" : "See the Set"} →
          </Link>
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/training"
          className="rounded-full border border-signal/40 px-4 py-2 text-sm font-semibold text-signal transition-colors hover:bg-signal/10"
        >
          Log a session →
        </Link>
        <Link
          href="/dashboard/ladder"
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-bone/80 transition-colors hover:bg-white/5"
        >
          View the Ladder
        </Link>
        <Link
          href="/dashboard/coach"
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-bone/80 transition-colors hover:bg-white/5"
        >
          Ask your Coach
        </Link>
      </section>
    </div>
  );
}
