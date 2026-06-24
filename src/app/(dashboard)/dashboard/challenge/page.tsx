import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type Athlete,
  type Drill,
  type Program,
  type ProgramCompletion,
  type ProgramDrill,
  type XpEvent,
} from "@/lib/types";
import { buildAthleteSet, currentWeekMonday } from "@/lib/challenge";
import { LogSession } from "../training/log-session";
import { TrackView } from "@/components/track-view";

export const metadata: Metadata = {
  title: "The Matchday Challenge · COLT",
};

export default async function MatchdayChallengePage() {
  const current = await getCurrentUser();
  // Layout already guards this, but narrow the type for TS.
  if (!current) return null;

  const monday = currentWeekMonday();

  // RLS scopes athletes to the club; programs returns this week's global Sets
  // plus any of the club's own Sets for the current week.
  const supabase = await createClient();
  const [athleteRes, programRes] = await Promise.all([
    supabase.from("athletes").select("*").order("full_name"),
    supabase.from("programs").select("*").eq("week_start", monday),
  ]);
  const athletes: Athlete[] = athleteRes.data ?? [];
  const programs: Program[] = programRes.data ?? [];

  // Pull the Sets' drills, this week's drill events, and any completions.
  const programIds = programs.map((p) => p.id);
  let programDrills: ProgramDrill[] = [];
  let completions: ProgramCompletion[] = [];
  let events: Pick<XpEvent, "athlete_id" | "drill_id" | "source">[] = [];
  const drillsById = new Map<string, Drill>();

  if (programIds.length > 0) {
    const [pdRes, complRes, evRes] = await Promise.all([
      supabase.from("program_drills").select("*").in("program_id", programIds),
      supabase
        .from("program_completions")
        .select("*")
        .in("program_id", programIds),
      supabase
        .from("xp_events")
        .select("athlete_id, drill_id, source")
        .eq("source", "drill")
        .gte("created_at", monday),
    ]);
    programDrills = pdRes.data ?? [];
    completions = complRes.data ?? [];
    events = evRes.data ?? [];

    const drillIds = [...new Set(programDrills.map((pd) => pd.drill_id))];
    if (drillIds.length > 0) {
      const { data } = await supabase
        .from("drills")
        .select("*")
        .in("id", drillIds);
      for (const d of data ?? []) drillsById.set(d.id, d);
    }
  }

  const sets = athletes.map((a) => ({
    athlete: a,
    set: buildAthleteSet(a, programs, programDrills, drillsById, events, completions),
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <TrackView feature="challenge" />
      <section>
        <h1 className="font-display text-3xl text-bone">
          The Matchday Challenge
        </h1>
        <p className="mt-1 text-bone/60">
          A fresh Challenge every week. Finish it to bank bonus XP — and keep your
          Heat alive.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {athletes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          No athletes yet —{" "}
          <Link href="/dashboard/athletes" className="text-signal hover:underline">
            add your first one
          </Link>{" "}
          and this week&apos;s Challenge will be waiting.
        </p>
      ) : (
        <ul className="grid gap-4">
          {sets.map(({ athlete, set }) => (
            <li
              key={athlete.id}
              className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-bone">
                    {athlete.full_name}
                  </div>
                  <div className="text-xs text-steel">
                    {SPORT_LABELS[athlete.sport]} ·{" "}
                    {AGE_GROUP_LABELS[athlete.age_group]}
                  </div>
                </div>
                {set && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      set.completed
                        ? "border-signal/60 bg-signal/10 text-signal"
                        : "border-white/15 text-bone/70"
                    }`}
                  >
                    {set.completed
                      ? "Challenge complete"
                      : `${set.doneCount}/${set.total} done`}
                  </span>
                )}
              </div>

              {set === null ? (
                <p className="rounded-lg border border-dashed border-white/15 px-4 py-5 text-center text-sm text-steel">
                  No Challenge for this cohort yet — a new Matchday Challenge drops
                  next week. Hit the{" "}
                  <Link
                    href="/dashboard/training"
                    className="text-signal hover:underline"
                  >
                    Training Library
                  </Link>{" "}
                  in the meantime and keep your Heat alive.
                </p>
              ) : (
                <AthleteSetCard
                  set={set}
                  athlete={{ id: athlete.id, full_name: athlete.full_name }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AthleteSetCard({
  set,
  athlete,
}: {
  set: NonNullable<ReturnType<typeof buildAthleteSet>>;
  athlete: { id: string; full_name: string };
}) {
  const pct = set.total > 0 ? Math.round((set.doneCount / set.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-display text-lg text-bone">
          {set.program.title}
        </div>
        <p className="mt-1 text-sm text-bone/70">{set.program.description}</p>
      </div>

      {/* Climb progress bar — reuses the .climb-fill motif from the XP bar. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold uppercase tracking-widest text-steel">
            The Challenge
          </span>
          <span className="text-steel">
            {set.doneCount} of {set.total} banked
          </span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="climb-fill absolute inset-y-0 left-0 rounded-full bg-signal transition-[width] duration-500"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      </div>

      {set.completed ? (
        <div className="rounded-lg border border-signal/30 bg-signal/10 px-4 py-3 text-sm">
          <span className="font-display text-base text-signal">
            Challenge complete 🏆
          </span>
          <span className="ml-2 text-bone/80">
            Bonus banked. Same time next week — keep the streak rolling.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {set.drills.map(({ drill, done }) => (
            <li
              key={drill.id}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "bg-signal text-ink"
                      : "border border-white/20 text-steel"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      done ? "text-bone/60 line-through" : "text-bone"
                    }`}
                  >
                    {drill.title}
                  </div>
                  <div className="text-xs text-steel">
                    +{drill.duration_min} XP
                  </div>
                </div>
              </div>
              {done ? (
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-signal">
                  Banked
                </span>
              ) : (
                <div className="shrink-0">
                  <LogSession drillId={drill.id} athletes={[athlete]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
