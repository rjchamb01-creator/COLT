// Matchday Challenge ("the Set") — pure helpers shared by the challenge page and
// the dashboard CTA. Brand vocabulary: the Matchday Challenge is a weekly Set of
// drills; finish the Set inside its week to bank bonus XP and keep your Heat alive.

import type {
  Athlete,
  Drill,
  Program,
  ProgramCompletion,
  ProgramDrill,
  XpEvent,
} from "@/lib/types";

/**
 * The Monday (UTC) of the current week, as YYYY-MM-DD. Matches how the live Set
 * is selected and how complete_drill detects completion (date_trunc('week', …)).
 */
export function currentWeekMonday(): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const shift = day === 0 ? -6 : 1 - day; // back to Monday
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
}

export type SetDrill = { drill: Drill; done: boolean };

export type AthleteSet = {
  program: Program;
  drills: SetDrill[];
  doneCount: number;
  total: number;
  completed: boolean;
};

/**
 * Build an athlete's current Set from already-fetched rows, or null when no Set
 * targets their cohort this week. A drill counts as done when the athlete has a
 * drill XP event for it inside the program's week. Prefers a club-specific Set
 * over a global one when both target the cohort.
 */
export function buildAthleteSet(
  athlete: Pick<Athlete, "id" | "sport" | "age_group">,
  programs: Program[],
  programDrills: ProgramDrill[],
  drillsById: Map<string, Drill>,
  events: Pick<XpEvent, "athlete_id" | "drill_id" | "source">[],
  completions: ProgramCompletion[],
): AthleteSet | null {
  const matches = programs.filter(
    (p) => p.sport === athlete.sport && p.age_group === athlete.age_group,
  );
  if (matches.length === 0) return null;

  // Club-specific Set wins over a global one for the same cohort.
  const program =
    matches.find((p) => p.club_id !== null) ?? matches[0];

  const drills = programDrills
    .filter((pd) => pd.program_id === program.id)
    .sort((a, b) => a.position - b.position)
    .map((pd) => drillsById.get(pd.drill_id))
    .filter((d): d is Drill => Boolean(d))
    .map((drill) => ({
      drill,
      done: events.some(
        (e) =>
          e.athlete_id === athlete.id &&
          e.source === "drill" &&
          e.drill_id === drill.id,
      ),
    }));

  const completed = completions.some(
    (c) => c.athlete_id === athlete.id && c.program_id === program.id,
  );
  const doneCount = drills.filter((d) => d.done).length;

  return { program, drills, doneCount, total: drills.length, completed };
}
