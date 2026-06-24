import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  ROLE_LABELS,
  SPORT_LABELS,
  type Announcement,
  type Athlete,
  type AthleteCap,
  type Cap,
  type Drill,
  type Event,
  type Program,
  type ProgramCompletion,
  type ProgramDrill,
  type UserRole,
  type XpEvent,
} from "@/lib/types";
import { computeHeat, tierForXp, totalXp } from "@/lib/gamification";
import { buildAthleteSet, currentWeekMonday } from "@/lib/challenge";
import { formatSessionTime, timeAgo } from "@/lib/squad";
import { TierBadge, XpBar, StreakFlame, CapBadge } from "@/components/gamification";
import { TrackView } from "@/components/track-view";
import { PlayerHome } from "./player-home";

export const metadata: Metadata = { title: "Dashboard · COLT" };

// Momentum-first framing per role (the seed of the Parent / Coach / Club views).
const ROLE_INTRO: Record<UserRole, string> = {
  admin: "Every club, every climber — at a glance.",
  club_admin: "Give your players a reason to train all week.",
  coach: "Your squads and the athletes you’re bringing through.",
  parent: "See how your athletes are progressing — XP, tiers, and badges.",
  athlete: "Your XP, your tier, your ladder. Go take it.",
};

export default async function DashboardPage() {
  const current = await getCurrentUser();
  // Layout already guards this, but narrow the type for TS.
  if (!current) return null;

  const role = current.profile?.role ?? "parent";

  const monday = currentWeekMonday();

  // Athletes get a focused "me" view (their own progress), not the club-wide
  // athlete list that parents/coaches see.
  if (role === "athlete") {
    return <PlayerHome userId={current.id} monday={monday} />;
  }

  // RLS scopes all of these to the user's own club automatically.
  let athletes: Athlete[] = [];
  let events: XpEvent[] = [];
  let earned: AthleteCap[] = [];
  let caps: Cap[] = [];
  let programs: Program[] = [];
  let programDrills: ProgramDrill[] = [];
  let completions: ProgramCompletion[] = [];
  // Squad Hub teasers — the next session + the latest word from the club.
  let nextSession: Event | null = null;
  let latestPost: Announcement | null = null;
  const drillsById = new Map<string, Drill>();

  if (current.club) {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const [athleteRes, eventRes, earnedRes, capRes, programRes, sessionRes, postRes] =
      await Promise.all([
        supabase.from("athletes").select("*").order("full_name"),
        supabase.from("xp_events").select("*"),
        supabase.from("athlete_caps").select("*"),
        supabase.from("caps").select("*"),
        supabase.from("programs").select("*").eq("week_start", monday),
        supabase
          .from("events")
          .select("*")
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(1),
        supabase
          .from("announcements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
    athletes = athleteRes.data ?? [];
    events = eventRes.data ?? [];
    earned = earnedRes.data ?? [];
    caps = capRes.data ?? [];
    programs = programRes.data ?? [];
    nextSession = sessionRes.data?.[0] ?? null;
    latestPost = postRes.data?.[0] ?? null;

    // Pull this week's Set drills + completions to summarise progress.
    const programIds = programs.map((p) => p.id);
    if (programIds.length > 0) {
      const [pdRes, complRes] = await Promise.all([
        supabase.from("program_drills").select("*").in("program_id", programIds),
        supabase
          .from("program_completions")
          .select("*")
          .in("program_id", programIds),
      ]);
      programDrills = pdRes.data ?? [];
      completions = complRes.data ?? [];

      const drillIds = [...new Set(programDrills.map((pd) => pd.drill_id))];
      if (drillIds.length > 0) {
        const { data } = await supabase
          .from("drills")
          .select("*")
          .in("id", drillIds);
        for (const d of data ?? []) drillsById.set(d.id, d);
      }
    }
  }

  // Per-athlete Set state for this week — drives the Matchday Challenge CTA.
  // Only this week's drill events count toward Set progress.
  const weekEvents = events.filter((e) => e.created_at >= monday);
  const athleteSets = athletes
    .map((a) =>
      buildAthleteSet(a, programs, programDrills, drillsById, weekEvents, completions),
    )
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const setsTotal = athleteSets.length;
  const setsComplete = athleteSets.filter((s) => s.completed).length;

  const capsById = new Map(caps.map((c) => [c.id, c]));

  const eventsByAthlete = new Map<string, XpEvent[]>();
  for (const e of events) {
    const list = eventsByAthlete.get(e.athlete_id) ?? [];
    list.push(e);
    eventsByAthlete.set(e.athlete_id, list);
  }

  const capsByAthlete = new Map<string, Cap[]>();
  for (const ac of earned) {
    const cap = capsById.get(ac.cap_id);
    if (!cap) continue;
    const list = capsByAthlete.get(ac.athlete_id) ?? [];
    list.push(cap);
    capsByAthlete.set(ac.athlete_id, list);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <TrackView feature="dashboard" />
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-bone">
            {ROLE_LABELS[role]}
          </h1>
          <p className="mt-1 text-bone/60">{ROLE_INTRO[role]}</p>
        </div>
        <Link
          href="/dashboard/ladder"
          className="hidden shrink-0 rounded-full border border-signal/40 px-4 py-2 text-sm font-semibold text-signal transition-colors hover:bg-signal/10 sm:inline-flex"
        >
          View the Ladder →
        </Link>
      </section>

      {(role === "club_admin" || role === "admin") && current.club?.join_code && (
        <section className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm">
            <div className="font-semibold text-bone">
              Invite to {current.club.name}
            </div>
            <div className="text-steel">
              Share this code so coaches and parents can join the climb.
            </div>
          </div>
          <code className="rounded-lg border border-signal/30 bg-signal/10 px-3 py-1.5 font-display text-base tracking-widest text-signal">
            {current.club.join_code}
          </code>
        </section>
      )}

      <section className="rounded-xl border border-signal/25 bg-signal/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-signal">
              This Week&apos;s Challenge
            </div>
            <h2 className="mt-1 font-display text-2xl text-bone">
              The Matchday Challenge
            </h2>
            <p className="mt-1 text-sm text-bone/70">
              {setsTotal === 0
                ? "No Challenge live for your squad yet — a fresh one drops next week. Keep training and hold your Heat."
                : setsComplete >= setsTotal
                  ? "Challenge complete across the squad — bonus banked. Same time next week."
                  : `Finish the Challenge — keep your Heat alive. ${setsComplete}/${setsTotal} ${
                      setsTotal === 1 ? "athlete" : "athletes"
                    } done this week.`}
            </p>
          </div>
          <Link
            href="/dashboard/challenge"
            className="inline-flex shrink-0 items-center rounded-full bg-signal px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.03]"
          >
            {setsTotal === 0 ? "See the Challenge" : "Finish the Challenge"} →
          </Link>
        </div>
      </section>

      {/* Squad Hub teaser — the free engagement loop in one card. */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-steel">
            The Squad
          </h2>
          <Link
            href="/dashboard/squad"
            className="text-sm font-semibold text-signal hover:underline"
          >
            Open the Squad →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-steel">
              Next session
            </div>
            {nextSession ? (
              <div className="mt-1">
                <div className="text-sm font-semibold text-signal">
                  {formatSessionTime(nextSession.starts_at)}
                </div>
                <div className="text-sm text-bone">{nextSession.title}</div>
                {nextSession.location && (
                  <div className="text-xs text-bone/60">
                    📍 {nextSession.location}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-steel">
                Nothing on the calendar yet.
              </p>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-steel">
              Latest from the club
            </div>
            {latestPost ? (
              <div className="mt-1">
                <div className="text-sm font-semibold text-bone">
                  {latestPost.title}
                </div>
                <p className="line-clamp-2 text-sm text-bone/60">
                  {latestPost.body}
                </p>
                <div className="mt-0.5 text-xs text-steel">
                  {timeAgo(latestPost.created_at)}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-steel">No posts yet.</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-steel">
            Athletes {current.club ? `· ${current.club.name}` : ""}
          </h2>
          <Link
            href="/dashboard/athletes"
            className="text-sm font-semibold text-signal hover:underline"
          >
            + Add athlete
          </Link>
        </div>
        {athletes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
            No athletes yet —{" "}
            <Link href="/dashboard/athletes" className="text-signal hover:underline">
              add your first one
            </Link>{" "}
            and every session they log shows up here.
          </p>
        ) : (
          <ul className="grid gap-3">
            {athletes.map((a) => {
              const evs = eventsByAthlete.get(a.id) ?? [];
              const xp = totalXp(evs);
              const tier = tierForXp(xp);
              const heat = computeHeat(evs);
              const won = capsByAthlete.get(a.id) ?? [];
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-bone">
                        {a.full_name}
                      </div>
                      <div className="text-xs text-steel">
                        {SPORT_LABELS[a.sport]} · {AGE_GROUP_LABELS[a.age_group]}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StreakFlame heat={heat} />
                      <TierBadge tier={tier.key} />
                    </div>
                  </div>

                  <XpBar xp={xp} />

                  {won.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {won.map((c) => (
                        <CapBadge key={c.id} icon={c.icon} name={c.name} />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
