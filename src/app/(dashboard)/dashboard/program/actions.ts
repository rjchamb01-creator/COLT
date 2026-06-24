"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { DRAFT_MODEL, getAnthropic, isCoachConfigured } from "@/lib/anthropic";
import { ProgramGoalSchema } from "@/lib/validation";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type Athlete,
  type Drill,
  type DrillSkill,
  type Skill,
} from "@/lib/types";

// Result of building a program. "locked" drives the upsell, "not_configured" the
// graceful "AI isn't switched on" note — both mirror the Coach / draftDrills
// degrade-gracefully stance (no 500s on a missing key or an unentitled athlete).
export type RecommendResult =
  | { ok: true }
  | {
      ok: false;
      reason: "forbidden" | "locked" | "not_configured" | "error";
      message: string;
    };

// The recommender quality bar matters more than the Coach (it's the paid lever),
// so it runs on DRAFT_MODEL (claude-sonnet-4-6) with structured outputs — the same
// constrained-to-real-ids pattern as the drill drafter. The model may ONLY select
// from the candidate drill ids we pass; it never invents drill content for a minor.
const SYSTEM = `You are a youth athletic development planner for COLT. You build a personalised weekly training program for ONE athlete by SELECTING and ORDERING drills from a fixed list of already-approved drills. Athletes are roughly 8–16.

Hard rules:
- You may ONLY use drills from the provided candidate list, referenced by their exact id. Never invent drills, exercises, equipment, or video — you are sequencing approved content, not authoring it.
- Choose 4–6 drills that best serve the athlete's stated goal. If fewer than 4 candidates fit the goal well, use what genuinely fits (minimum 3).
- Order them as a sensible progression: warm up / fundamentals first (lower difficulty), build toward the harder, goal-specific work. Use the difficulty (1=intro, 2=building, 3=advanced) and skills to sequence.
- Prefer drills whose skills match the goal; don't pad with unrelated drills.

Voice (COLT brand — an encouraging captain talking to a young athlete; second person, active, short, momentum not fear):
- title: a short punchy program name (e.g. "Faster Off the Mark").
- summary: 1–2 sentences telling the athlete what this week's plan builds and why it'll make them sharper. No hype clichés, no fear.`;

// Drill shape handed to the model — title/description/duration/difficulty/skills,
// keyed by the id the model must echo back.
type Candidate = {
  id: string;
  title: string;
  description: string;
  duration_min: number;
  difficulty: number | null;
  skills: string[];
};

export async function recommendProgram(
  athleteId: string,
  rawGoal: string,
): Promise<RecommendResult> {
  const current = await getCurrentUser();
  if (!current?.profile?.club_id) {
    return { ok: false, reason: "forbidden", message: "Sign in to build a program." };
  }

  const parsed = ProgramGoalSchema.safeParse({ goal: rawGoal });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Tell us what to work on.";
    return { ok: false, reason: "error", message: first };
  }
  const goal = parsed.data.goal;

  const supabase = await createClient();

  // The athlete (RLS scopes this to the caller's club). We need their cohort to
  // pick candidate drills.
  const { data: athleteRow } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", athleteId)
    .maybeSingle();
  const athlete = athleteRow as Athlete | null;
  if (!athlete) {
    return { ok: false, reason: "forbidden", message: "Athlete not found." };
  }

  // Paid gate — friendly short-circuit before spending a model call. The RPC
  // re-checks this server-side; RLS hides the result regardless. Uses the
  // per-athlete gate helper (manages athlete AND athlete holds Tier 1).
  const { data: canManage } = await supabase.rpc(
    "current_user_can_manage_entitled_athlete",
    { p_athlete_id: athleteId },
  );
  if (!canManage) {
    return {
      ok: false,
      reason: "locked",
      message:
        "Personalised Weekly Programs are a Tier 1 membership perk. Unlock the training edge from the Membership page.",
    };
  }

  // Not switched on yet → graceful, no 500 (mirrors the AI Coach + drill drafter).
  if (!isCoachConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "The program builder isn't switched on yet — add a real ANTHROPIC_API_KEY and it'll start building plans.",
    };
  }

  // Candidate drills = the athlete's cohort (sport + age group). RLS already
  // returns global + club drills, including premium ones since the athlete is
  // entitled — so the paid library is in play for the plan.
  const { data: drillRows } = await supabase
    .from("drills")
    .select("*")
    .eq("sport", athlete.sport)
    .eq("age_group", athlete.age_group);
  const drills = (drillRows ?? []) as Drill[];
  if (drills.length === 0) {
    return {
      ok: false,
      reason: "error",
      message: "No drills in the library for this cohort yet — check back soon.",
    };
  }

  // Skill labels per drill (so the model can sequence by goal).
  const drillIds = drills.map((d) => d.id);
  const [{ data: linkRows }, { data: skillRows }] = await Promise.all([
    supabase.from("drill_skills").select("*").in("drill_id", drillIds),
    supabase.from("skills").select("*"),
  ]);
  const skillLabelById = new Map(
    ((skillRows ?? []) as Skill[]).map((s) => [s.id, s.label]),
  );
  const skillsByDrill = new Map<string, string[]>();
  for (const link of (linkRows ?? []) as DrillSkill[]) {
    const label = skillLabelById.get(link.skill_id);
    if (!label) continue;
    const arr = skillsByDrill.get(link.drill_id) ?? [];
    arr.push(label);
    skillsByDrill.set(link.drill_id, arr);
  }

  const candidates: Candidate[] = drills.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description.slice(0, 400),
    duration_min: d.duration_min,
    difficulty: d.difficulty,
    skills: skillsByDrill.get(d.id) ?? [],
  }));

  const allowedIds = candidates.map((c) => c.id);

  // Structured output: the model returns a title, summary, and an ORDERED list of
  // drill ids constrained to the candidate set via an enum — so it cannot fabricate
  // a drill, only sequence real ones.
  const PlanSchema = z.object({
    title: z.string(),
    summary: z.string(),
    drill_ids: z.array(z.enum(allowedIds as [string, ...string[]])),
  });

  const candidateList = candidates
    .map((c) => {
      const skills = c.skills.length ? ` · skills: ${c.skills.join(", ")}` : "";
      const diff = c.difficulty ? ` · difficulty ${c.difficulty}` : "";
      return `[${c.id}] ${c.title} (${c.duration_min} min${diff}${skills})\n    ${c.description}`;
    })
    .join("\n");

  const userPrompt = `Athlete sport: ${SPORT_LABELS[athlete.sport]}
Age group: ${AGE_GROUP_LABELS[athlete.age_group]}
Goal: ${goal}

Candidate drills (choose and order ONLY from these, by id):
${candidateList}`;

  let title: string;
  let summary: string;
  let orderedIds: string[];
  try {
    const anthropic = getAnthropic();
    const message = await anthropic.messages.parse({
      model: DRAFT_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(PlanSchema) },
    });

    const plan = message.parsed_output;
    if (!plan) {
      return {
        ok: false,
        reason: "error",
        message: "The builder returned nothing usable. Try again.",
      };
    }

    // Dedupe (preserve order) and clamp to the RPC's 1–8 window. The enum already
    // guarantees every id is a real candidate.
    const allowed = new Set(allowedIds);
    orderedIds = [...new Set(plan.drill_ids)].filter((id) => allowed.has(id)).slice(0, 8);
    title = plan.title.trim().slice(0, 120) || "Your Weekly Program";
    summary = plan.summary.trim().slice(0, 2000);
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "The builder hit a snag. Catch your breath and try again.",
    };
  }

  if (orderedIds.length === 0) {
    return {
      ok: false,
      reason: "error",
      message: "Couldn't match drills to that goal — try rewording it.",
    };
  }

  // Persist via the RPC-as-seam: it re-checks management + entitlement and that
  // every id is a real, club-visible drill before writing anything.
  const { error } = await supabase.rpc("recommend_program", {
    p_athlete_id: athleteId,
    p_goal: goal,
    p_title: title,
    p_summary: summary,
    p_drill_ids: orderedIds,
  });
  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  revalidatePath("/dashboard/program");
  await logActivity("program", "program_built", {
    sport: athlete.sport,
    ageGroup: athlete.age_group,
    drills: orderedIds.length,
  });
  return { ok: true };
}
