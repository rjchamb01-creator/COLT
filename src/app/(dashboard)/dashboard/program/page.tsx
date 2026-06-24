import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isCoachConfigured } from "@/lib/anthropic";
import { currentWeekMonday } from "@/lib/challenge";
import { buildRecommendedProgram, type RecommendedProgramView } from "@/lib/program";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type Athlete,
  type Drill,
  type Program,
  type ProgramDrill,
  type Subscription,
  type SubscriptionStatus,
  type XpEvent,
} from "@/lib/types";
import { TrackView } from "@/components/track-view";
import { LogSession } from "../training/log-session";
import { GoalForm } from "./goal-form";

export const metadata: Metadata = {
  title: "Weekly Programs · COLT",
};

// A subscription grants entitlement only while trialing/active (mirrors the DB
// helper subscription_is_live — past_due is NOT live).
const LIVE: SubscriptionStatus[] = ["trialing", "active"];

export default async function WeeklyProgramsPage() {
  const current = await getCurrentUser();
  if (!current) return null;

  const monday = currentWeekMonday();
  const supabase = await createClient();

  // The athletes this user pays for / is: the ones they manage, or themselves.
  const { data: athleteRows } = await supabase
    .from("athletes")
    .select("*")
    .or(`parent_id.eq.${current.id},profile_id.eq.${current.id}`)
    .order("full_name");
  const athletes = (athleteRows ?? []) as Athlete[];

  // Entitlement per athlete (a live Tier 1/Tier 2 subscription). RLS lets the
  // payer / linked athlete read these rows.
  const entitled = new Set<string>();
  if (athletes.length > 0) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*")
      .in(
        "athlete_id",
        athletes.map((a) => a.id),
      );
    for (const s of (subs ?? []) as Subscription[]) {
      if (LIVE.includes(s.status)) entitled.add(s.athlete_id);
    }
  }

  // The athletes' current recommended programs (RLS only returns entitled ones).
  const programByAthlete = new Map<string, Program>();
  let programDrills: ProgramDrill[] = [];
  let events: Pick<XpEvent, "athlete_id" | "drill_id" | "source">[] = [];
  const drillsById = new Map<string, Drill>();

  if (athletes.length > 0) {
    const { data: programRows } = await supabase
      .from("programs")
      .select("*")
      .eq("source", "recommended")
      .in(
        "athlete_id",
        athletes.map((a) => a.id),
      );
    for (const p of (programRows ?? []) as Program[]) {
      if (p.athlete_id) programByAthlete.set(p.athlete_id, p);
    }

    const programIds = [...programByAthlete.values()].map((p) => p.id);
    if (programIds.length > 0) {
      const [pdRes, evRes] = await Promise.all([
        supabase.from("program_drills").select("*").in("program_id", programIds),
        supabase
          .from("xp_events")
          .select("athlete_id, drill_id, source")
          .eq("source", "drill")
          .gte("created_at", monday),
      ]);
      programDrills = (pdRes.data ?? []) as ProgramDrill[];
      events = evRes.data ?? [];

      const drillIds = [...new Set(programDrills.map((pd) => pd.drill_id))];
      if (drillIds.length > 0) {
        const { data } = await supabase.from("drills").select("*").in("id", drillIds);
        for (const d of (data ?? []) as Drill[]) drillsById.set(d.id, d);
      }
    }
  }

  const aiConfigured = isCoachConfigured();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <TrackView feature="program" />

      <section>
        <h1 className="font-display text-3xl text-bone">Weekly Programs</h1>
        <p className="mt-1 text-bone/60">
          Tell us the goal. We&apos;ll build your athlete a personalised plan from
          the library — drills picked and put in order for what they want to sharpen.
          Work through it to bank XP and keep your Heat alive.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {athletes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          Weekly Programs are built for a specific athlete.{" "}
          <Link href="/dashboard/athletes" className="text-signal hover:underline">
            Add an athlete
          </Link>{" "}
          to get started.
        </p>
      ) : (
        <ul className="grid gap-5">
          {athletes.map((athlete) => {
            const isEntitled = entitled.has(athlete.id);
            const program = programByAthlete.get(athlete.id);
            const view =
              program &&
              buildRecommendedProgram(
                athlete.id,
                program,
                programDrills,
                drillsById,
                events,
              );

            return (
              <li
                key={athlete.id}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-display text-xl text-bone">
                      {athlete.full_name}
                    </div>
                    <div className="text-xs text-steel">
                      {SPORT_LABELS[athlete.sport]} ·{" "}
                      {AGE_GROUP_LABELS[athlete.age_group]}
                    </div>
                  </div>
                  {view && (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        view.completed
                          ? "border-signal/60 bg-signal/10 text-signal"
                          : "border-white/15 text-bone/70"
                      }`}
                    >
                      {view.completed
                        ? "Program complete"
                        : `${view.doneCount}/${view.total} done`}
                    </span>
                  )}
                </div>

                {!isEntitled ? (
                  <Upsell />
                ) : (
                  <>
                    {view && view.total > 0 && (
                      <ProgramCard
                        view={view}
                        athlete={{ id: athlete.id, full_name: athlete.full_name }}
                      />
                    )}
                    {aiConfigured || !view ? (
                      <GoalForm
                        athleteId={athlete.id}
                        aiConfigured={aiConfigured}
                        hasProgram={Boolean(view)}
                      />
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-steel">
        The plan is the membership perk — doing the work and earning XP is always
        free. The squad and the Matchday Challenge stay open to everyone.
      </p>
    </div>
  );
}

// Tier 1 upsell when the athlete isn't on a paid plan.
function Upsell() {
  return (
    <div className="rounded-xl border border-signal/30 bg-signal/[0.06] p-5">
      <div className="font-display text-lg text-bone">Unlock the training edge</div>
      <p className="mt-1 text-sm text-bone/70">
        Personalised Weekly Programs are part of a Tier 1 membership — a plan built
        around your athlete&apos;s goal, refreshed as they grow.
      </p>
      <Link
        href="/dashboard/billing"
        className="mt-4 inline-flex items-center justify-center rounded-full bg-signal px-5 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02]"
      >
        See membership
      </Link>
    </div>
  );
}

function ProgramCard({
  view,
  athlete,
}: {
  view: RecommendedProgramView;
  athlete: { id: string; full_name: string };
}) {
  const pct = view.total > 0 ? Math.round((view.doneCount / view.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div>
        <div className="font-display text-lg text-bone">{view.program.title}</div>
        {view.program.goal && (
          <div className="mt-0.5 text-xs uppercase tracking-wide text-steel">
            Goal: {view.program.goal}
          </div>
        )}
        <p className="mt-1.5 text-sm text-bone/70">{view.program.description}</p>
      </div>

      {/* Climb progress bar — reuses the .climb-fill XP-bar motif. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold uppercase tracking-widest text-steel">
            This week
          </span>
          <span className="text-steel">
            {view.doneCount} of {view.total} banked
          </span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="climb-fill absolute inset-y-0 left-0 rounded-full bg-signal transition-[width] duration-500"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      </div>

      {view.completed ? (
        <div className="rounded-lg border border-signal/30 bg-signal/10 px-4 py-3 text-sm">
          <span className="font-display text-base text-signal">
            Program done 🏆
          </span>
          <span className="ml-2 text-bone/80">
            Every drill banked. Set a new goal below to build the next one.
          </span>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {view.drills.map(({ drill, done }, i) => (
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
                  {done ? "✓" : i + 1}
                </span>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      done ? "text-bone/60 line-through" : "text-bone"
                    }`}
                  >
                    {drill.title}
                  </div>
                  <div className="text-xs text-steel">+{drill.duration_min} XP</div>
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
        </ol>
      )}
    </div>
  );
}
