import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type Announcement,
  type AthleteCap,
  type Cap,
  type Event,
  type Profile,
  type Program,
  type ProgramCompletion,
  type XpEvent,
  type Athlete,
} from "@/lib/types";
import {
  buildSquadBuzz,
  formatSessionTime,
  timeAgo,
  type SquadMilestone,
} from "@/lib/squad";
import { CapBadge, TierBadge } from "@/components/gamification";
import { TIER_LABELS } from "@/lib/gamification";
import { SquadCompose } from "./squad-compose";
import { TrackView } from "@/components/track-view";

export const metadata: Metadata = { title: "The Squad · COLT" };

export default async function SquadPage() {
  const current = await getCurrentUser();
  // Layout already guards this, but narrow the type for TS.
  if (!current) return null;

  const role = current.profile?.role ?? "parent";
  const isStaff = role === "coach" || role === "club_admin" || role === "admin";
  const nowIso = new Date().toISOString();

  // All reads are club-scoped by RLS (one club == one Squad for the MVP).
  const supabase = await createClient();
  const [eventRes, announcementRes, athleteRes, xpRes, earnedRes, capRes, complRes, programRes] =
    await Promise.all([
      supabase
        .from("events")
        .select("*")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true }),
      supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("athletes").select("*"),
      supabase.from("xp_events").select("*"),
      supabase.from("athlete_caps").select("*"),
      supabase.from("caps").select("*"),
      supabase.from("program_completions").select("*"),
      supabase.from("programs").select("*"),
    ]);

  const events: Event[] = eventRes.data ?? [];
  const announcements: Announcement[] = announcementRes.data ?? [];
  const athletes: Athlete[] = athleteRes.data ?? [];
  const xpEvents: XpEvent[] = xpRes.data ?? [];
  const earnedCaps: AthleteCap[] = earnedRes.data ?? [];
  const caps: Cap[] = capRes.data ?? [];
  const completions: ProgramCompletion[] = complRes.data ?? [];
  const programs: Program[] = programRes.data ?? [];

  // Author names for the comms feed.
  const authorIds = [
    ...new Set(announcements.map((a) => a.author_id).filter(Boolean)),
  ] as string[];
  const authorName = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", authorIds);
    for (const p of (data ?? []) as Profile[]) {
      if (p.full_name) authorName.set(p.id, p.full_name);
    }
  }

  const buzz = buildSquadBuzz(
    athletes,
    xpEvents,
    earnedCaps,
    caps,
    completions,
    programs,
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <TrackView feature="squad" />
      <section>
        <h1 className="font-display text-3xl text-bone">The Squad</h1>
        <p className="mt-1 text-bone/60">
          {isStaff
            ? "Rally your Squad — post the word and lock in the next session."
            : "What's on, what's been said, and who's been levelling up."}
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {isStaff && <SquadCompose />}

      {/* Squad buzz — the engagement loop in one strip (caps, Sets, tier-ups). */}
      {buzz.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
            Squad Buzz
          </h2>
          <ul className="flex flex-col gap-2">
            {buzz.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MilestoneBadge m={m} />
                  <span className="truncate text-sm text-bone/85">
                    {milestoneLine(m)}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-steel">
                  {timeAgo(m.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* Upcoming sessions — the schedule. */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
            Upcoming Sessions
          </h2>
          {events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
              {isStaff
                ? "Nothing on the calendar. Schedule a session above and tell the Squad to show up."
                : "No sessions on the calendar yet — check back soon."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-signal">
                    {formatSessionTime(e.starts_at)}
                  </div>
                  <div className="mt-1 font-semibold text-bone">
                    {e.title}
                  </div>
                  {e.location && (
                    <div className="mt-0.5 text-sm text-bone/70">
                      📍 {e.location}
                    </div>
                  )}
                  {e.description && (
                    <p className="mt-2 text-sm text-bone/60">
                      {e.description}
                    </p>
                  )}
                  {(e.sport || e.age_group) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.sport && (
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-bone/70">
                          {SPORT_LABELS[e.sport]}
                        </span>
                      )}
                      {e.age_group && (
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-bone/70">
                          {AGE_GROUP_LABELS[e.age_group]}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Announcements — the comms. */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
            From the Club
          </h2>
          {announcements.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
              {isStaff
                ? "Nothing posted yet. Drop the first word to your Squad above."
                : "No announcements yet — the club will post here."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {announcements.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-bone">{a.title}</div>
                    <span className="shrink-0 text-xs text-steel">
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-bone/70">
                    {a.body}
                  </p>
                  {a.author_id && authorName.get(a.author_id) && (
                    <div className="mt-2 text-xs text-steel">
                      — {authorName.get(a.author_id)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// The brand component for each milestone kind: badges → CapBadge, tier-ups →
// TierBadge, Challenges → a trophy chip. (Type/kind names keep "cap"/"set".)
function MilestoneBadge({ m }: { m: SquadMilestone }) {
  if (m.kind === "cap") {
    return <CapBadge icon={m.capIcon} name={m.capName} className="shrink-0" />;
  }
  if (m.kind === "tier") {
    return <TierBadge tier={m.tier} className="shrink-0" />;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-1 text-xs font-semibold text-signal">
      <span aria-hidden>🏆</span> Challenge
    </span>
  );
}

// Momentum-first feed copy in the COLT voice.
function milestoneLine(m: SquadMilestone): string {
  switch (m.kind) {
    case "cap":
      return `${m.athleteName} earned the ${m.capName} badge`;
    case "set":
      return `${m.athleteName} finished ${m.setTitle}`;
    case "tier":
      return `${m.athleteName} levelled up to ${TIER_LABELS[m.tier]}`;
  }
}
