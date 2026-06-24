// Squad Feed — pure helpers shared by the Squad page and the dashboard card.
//
// MVP simplification: one club == one Squad, so the feed is club-scoped (there
// is no separate squad entity yet). The feed needs NO new table — it is
// assembled here by merging rows the caller can already read under RLS:
//   • recent announcements + upcoming events (the comms + schedule)
//   • squad milestones derived from the gamification ledgers — caps earned,
//     Sets completed, and tier-ups — which is what ties the engagement loop
//     together in one place (the moat, per CLAUDE.md / BRAND.md).

import type {
  Athlete,
  AthleteCap,
  Cap,
  Program,
  ProgramCompletion,
  Tier,
  XpEvent,
} from "@/lib/types";
import { tierForXp } from "@/lib/gamification";

// One item in the "squad buzz" strip. `kind` drives which brand component the
// UI renders (CapBadge / TierBadge / a Set trophy chip).
export type SquadMilestone =
  | {
      kind: "cap";
      id: string;
      at: string;
      athleteName: string;
      capName: string;
      capIcon: string;
    }
  | {
      kind: "set";
      id: string;
      at: string;
      athleteName: string;
      setTitle: string;
    }
  | {
      kind: "tier";
      id: string;
      at: string;
      athleteName: string;
      tier: Tier;
    };

/**
 * Build the recent squad-milestone feed from already-fetched, RLS-scoped rows.
 * Returns the most recent `limit` milestones, newest first.
 *
 * Tier-ups aren't stored anywhere (XP is the single source of truth), so they're
 * reconstructed by replaying each athlete's XP ledger in chronological order and
 * emitting a milestone at the event that first crossed into a higher tier.
 */
export function buildSquadBuzz(
  athletes: Athlete[],
  xpEvents: XpEvent[],
  earnedCaps: AthleteCap[],
  caps: Cap[],
  completions: ProgramCompletion[],
  programs: Program[],
  limit = 8,
): SquadMilestone[] {
  const athleteName = new Map(athletes.map((a) => [a.id, a.full_name]));
  const capById = new Map(caps.map((c) => [c.id, c]));
  const programById = new Map(programs.map((p) => [p.id, p]));

  const milestones: SquadMilestone[] = [];

  // Caps earned.
  for (const ac of earnedCaps) {
    const cap = capById.get(ac.cap_id);
    const name = athleteName.get(ac.athlete_id);
    if (!cap || !name) continue;
    milestones.push({
      kind: "cap",
      id: `cap-${ac.id}`,
      at: ac.earned_at,
      athleteName: name,
      capName: cap.name,
      capIcon: cap.icon,
    });
  }

  // Sets completed.
  for (const pc of completions) {
    const program = programById.get(pc.program_id);
    const name = athleteName.get(pc.athlete_id);
    if (!name) continue;
    milestones.push({
      kind: "set",
      id: `set-${pc.id}`,
      at: pc.completed_at,
      athleteName: name,
      setTitle: program?.title ?? "the Matchday Challenge",
    });
  }

  // Tier-ups — replay each athlete's ledger in order and detect crossings.
  const eventsByAthlete = new Map<string, XpEvent[]>();
  for (const e of xpEvents) {
    const list = eventsByAthlete.get(e.athlete_id) ?? [];
    list.push(e);
    eventsByAthlete.set(e.athlete_id, list);
  }
  for (const [athleteId, events] of eventsByAthlete) {
    const name = athleteName.get(athleteId);
    if (!name) continue;
    const ordered = [...events].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
    let running = 0;
    let prevTier = tierForXp(0).key;
    for (const e of ordered) {
      running += e.xp;
      const tier = tierForXp(running).key;
      if (tier !== prevTier) {
        milestones.push({
          kind: "tier",
          id: `tier-${e.id}`,
          at: e.created_at,
          athleteName: name,
          tier,
        });
        prevTier = tier;
      }
    }
  }

  return milestones
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}

/**
 * Short, momentum-first relative time ("just now", "2h ago", "3d ago") for feed
 * timestamps. Falls back to a date for anything older than a week.
 */
export function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/** Format an event's start as "Tue 20 Jun · 5:00pm" — punchy, second-person feed copy. */
export function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d
    .toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${date} · ${time}`;
}
