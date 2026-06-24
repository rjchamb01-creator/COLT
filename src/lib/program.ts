// AI Program Recommender (Tier 1) — pure helpers shared by the Weekly Programs
// page. A recommended program is an athlete-targeted, AI-sequenced list of vetted
// library drills the kid works through over the week, earning XP the normal way.
//
// Progress is derived the same way the Matchday Set is (drills "done" = the
// athlete has a drill XP event for them this week), so it stays in lock-step with
// the gamification ledger without any extra completion table. The plan itself is
// the paid artifact; doing the work + earning XP stays free.

import type {
  Drill,
  Program,
  ProgramDrill,
  XpEvent,
} from "@/lib/types";

export type ProgramDrillView = { drill: Drill; done: boolean };

export type RecommendedProgramView = {
  program: Program;
  drills: ProgramDrillView[];
  doneCount: number;
  total: number;
  completed: boolean;
};

/**
 * Assemble an athlete's current recommended program from already-fetched rows, or
 * null when the athlete has none. A drill counts as done when the athlete has a
 * drill XP event for it on/after the program's week_start — identical to how the
 * Matchday Set computes progress.
 */
export function buildRecommendedProgram(
  athleteId: string,
  program: Program,
  programDrills: ProgramDrill[],
  drillsById: Map<string, Drill>,
  events: Pick<XpEvent, "athlete_id" | "drill_id" | "source">[],
): RecommendedProgramView {
  const drills = programDrills
    .filter((pd) => pd.program_id === program.id)
    .sort((a, b) => a.position - b.position)
    .map((pd) => drillsById.get(pd.drill_id))
    .filter((d): d is Drill => Boolean(d))
    .map((drill) => ({
      drill,
      done: events.some(
        (e) =>
          e.athlete_id === athleteId &&
          e.source === "drill" &&
          e.drill_id === drill.id,
      ),
    }));

  const doneCount = drills.filter((d) => d.done).length;
  const total = drills.length;
  return {
    program,
    drills,
    doneCount,
    total,
    completed: total > 0 && doneCount === total,
  };
}
