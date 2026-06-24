"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  DRAFT_MODEL,
  getAnthropic,
  isCoachConfigured,
} from "@/lib/anthropic";
import {
  CreateDrillSchema,
  flattenZodError,
  type AuthFormState,
  type CreateDrillInput,
} from "@/lib/validation";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  SPORTS,
  type AgeGroup,
  type Skill,
  type Sport,
} from "@/lib/types";

// Only coaches/club_admins/admins author content. RLS is the real boundary;
// this just short-circuits the write path for non-staff with a friendly message.
function isStaff(current: CurrentUser | null): boolean {
  const role = current?.profile?.role;
  return role === "coach" || role === "club_admin" || role === "admin";
}

// Resolve the club_id a new drill should carry. Global (club_id NULL) is
// admin-only; everyone else writes to their own club. RLS enforces this too.
function resolveClubId(current: CurrentUser, scope: string | null): string | null {
  const isAdmin = current.profile?.role === "admin";
  if (scope === "global" && isAdmin) return null;
  return current.profile?.club_id ?? null;
}

// Read the shared drill fields out of a submitted form.
function parseDrillForm(formData: FormData) {
  return CreateDrillSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    durationMin: formData.get("durationMin"),
    sport: formData.get("sport"),
    ageGroup: formData.get("ageGroup"),
    videoUrl: formData.get("videoUrl"),
    difficulty: formData.get("difficulty"),
    skillIds: formData.getAll("skillIds").map(String),
  });
}

// Insert a drill + its skill tags. Shared by the manual form and the AI-draft
// approve path. club_id on the drill_skills rows is denormalised from the drill.
async function insertDrill(
  data: CreateDrillInput,
  clubId: string | null,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: drill, error } = await supabase
    .from("drills")
    .insert({
      club_id: clubId,
      sport: data.sport,
      age_group: data.ageGroup,
      title: data.title,
      description: data.description,
      duration_min: data.durationMin,
      video_url: data.videoUrl ?? null,
      difficulty: data.difficulty ?? null,
    })
    .select("id")
    .single();
  if (error || !drill) return error?.message ?? "Could not save the drill.";

  if (data.skillIds.length > 0) {
    const { error: linkError } = await supabase.from("drill_skills").insert(
      data.skillIds.map((skill_id) => ({
        drill_id: drill.id,
        skill_id,
        club_id: clubId,
      })),
    );
    if (linkError) return linkError.message;
  }
  return null;
}

// Create a drill from the manual authoring form (useActionState).
export async function createDrill(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseDrillForm(formData);
  if (!parsed.success) return { errors: flattenZodError(parsed.error) };

  const current = await getCurrentUser();
  if (!isStaff(current) || !current?.profile?.club_id) {
    return { message: "Only coaches and admins can author drills." };
  }

  const clubId = resolveClubId(current, formData.get("scope") as string | null);
  const error = await insertDrill(parsed.data, clubId);
  if (error) return { message: error };

  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard/training");
  await logActivity("library", "drill_created", {
    sport: parsed.data.sport,
    ageGroup: parsed.data.ageGroup,
    global: clubId === null,
  });
  return { success: `“${parsed.data.title}” is in the library.` };
}

// Edit an existing drill + re-sync its skill tags. Visibility (club vs global)
// is fixed at creation — edits keep the drill's existing club_id. RLS gates the
// update/delete to the drill's owner.
export async function updateDrill(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const drillId = String(formData.get("drillId") ?? "");
  if (!drillId) return { message: "Missing drill." };

  const parsed = parseDrillForm(formData);
  if (!parsed.success) return { errors: flattenZodError(parsed.error) };

  const current = await getCurrentUser();
  if (!isStaff(current)) {
    return { message: "Only coaches and admins can edit drills." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("drills")
    .select("club_id")
    .eq("id", drillId)
    .maybeSingle();
  if (!existing) return { message: "Drill not found." };
  const clubId = existing.club_id;

  const { error: updateError } = await supabase
    .from("drills")
    .update({
      sport: parsed.data.sport,
      age_group: parsed.data.ageGroup,
      title: parsed.data.title,
      description: parsed.data.description,
      duration_min: parsed.data.durationMin,
      video_url: parsed.data.videoUrl ?? null,
      difficulty: parsed.data.difficulty ?? null,
    })
    .eq("id", drillId);
  if (updateError) return { message: updateError.message };

  // Re-sync the skill tags: clear the old set, insert the new one.
  await supabase.from("drill_skills").delete().eq("drill_id", drillId);
  if (parsed.data.skillIds.length > 0) {
    const { error: linkError } = await supabase.from("drill_skills").insert(
      parsed.data.skillIds.map((skill_id) => ({
        drill_id: drillId,
        skill_id,
        club_id: clubId,
      })),
    );
    if (linkError) return { message: linkError.message };
  }

  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard/training");
  await logActivity("library", "drill_updated", { drill_id: drillId });
  return { success: `“${parsed.data.title}” updated.` };
}

// ---------------------------------------------------------------------------
// AI drill-DRAFT tool. Claude drafts structured drills; a human reviews/edits
// and approves before anything reaches the library (human-in-the-loop is
// non-negotiable for a youth product — this NEVER auto-publishes). Server-only.
// ---------------------------------------------------------------------------

export type DraftDrill = {
  title: string;
  description: string;
  durationMin: number;
  difficulty: number;
  skillIds: string[];
};

export type DraftResult =
  | { ok: true; drafts: DraftDrill[] }
  | { ok: false; reason: "forbidden" | "not_configured" | "error"; message: string };

const DRAFT_SYSTEM = `You draft youth sports training drills for COLT, a youth athlete development app (athletes roughly 8–16). You produce STRUCTURED DRAFTS that a human coach reviews and edits before anything is published — you are not the final author.

Safety rules (you are drafting content for minors):
- Age-appropriate, safe, and positive. No contact/collision drills for younger ages; no max-effort or load-bearing work; nothing with injury risk.
- Practical drills a coach can run at training with basic equipment (cones, balls, bibs).
- Clear, concise "how to run it" descriptions in plain language.
- Never invent video links, brand names, or external references.

Draft EXACTLY 3 distinct drills for the requested sport, age group, and goal. For each: a short punchy title, a 2–4 sentence description of how to run it, a duration in minutes (5–30), a difficulty (1 = intro, 2 = building, 3 = advanced), and the most relevant skills chosen ONLY from the provided skill keys.`;

export async function draftDrills(input: {
  sport: Sport;
  ageGroup: AgeGroup;
  goal: string;
}): Promise<DraftResult> {
  const current = await getCurrentUser();
  if (!isStaff(current)) {
    return { ok: false, reason: "forbidden", message: "Only coaches and admins can use the AI drafter." };
  }

  const goal = (input.goal ?? "").trim().slice(0, 300);
  if (goal.length < 3) {
    return { ok: false, reason: "error", message: "Tell the drafter what to focus on." };
  }
  if (!(SPORTS as string[]).includes(input.sport)) {
    return { ok: false, reason: "error", message: "Pick a sport." };
  }
  if (!["u10", "u13", "u16"].includes(input.ageGroup)) {
    return { ok: false, reason: "error", message: "Pick an age group." };
  }

  // Not switched on yet → graceful, no 500 (mirrors the AI Coach route).
  if (!isCoachConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "The AI drafter isn't switched on yet — add a real ANTHROPIC_API_KEY and it'll start drafting drills for you to review.",
    };
  }

  // The skills the model may choose from for this sport (global + sport-specific).
  const supabase = await createClient();
  const { data: skillRows } = await supabase
    .from("skills")
    .select("*")
    .or(`sport.is.null,sport.eq.${input.sport}`)
    .order("label");
  const skills: Skill[] = skillRows ?? [];
  const keyToId = new Map(skills.map((s) => [s.key, s.id]));
  const allowedKeys = skills.map((s) => s.key);
  if (allowedKeys.length === 0) {
    return { ok: false, reason: "error", message: "No skills available to tag with yet." };
  }

  // Structured output: the model returns clean, schema-validated drafts. Skills
  // are constrained to the allowed key set via an enum, so we can map keys → ids.
  const DraftSchema = z.object({
    drafts: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        duration_min: z.number(),
        difficulty: z.number(),
        skills: z.array(z.enum(allowedKeys as [string, ...string[]])),
      }),
    ),
  });

  const skillList = skills.map((s) => `${s.key} (${s.label})`).join(", ");
  const userPrompt = `Sport: ${SPORT_LABELS[input.sport]}
Age group: ${AGE_GROUP_LABELS[input.ageGroup]}
Goal / focus: ${goal}

Available skill keys (choose only from these): ${skillList}`;

  try {
    const anthropic = getAnthropic();
    const message = await anthropic.messages.parse({
      model: DRAFT_MODEL,
      max_tokens: 2048,
      system: DRAFT_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(DraftSchema) },
    });

    const parsed = message.parsed_output;
    if (!parsed) {
      return { ok: false, reason: "error", message: "The drafter returned nothing usable. Try again." };
    }

    const drafts: DraftDrill[] = parsed.drafts.map((d) => ({
      title: d.title.slice(0, 120),
      description: d.description.slice(0, 2000),
      durationMin: Math.min(180, Math.max(1, Math.round(d.duration_min))),
      difficulty: Math.min(3, Math.max(1, Math.round(d.difficulty))),
      skillIds: d.skills
        .map((k) => keyToId.get(k))
        .filter((id): id is string => Boolean(id)),
    }));

    return { ok: true, drafts };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "The drafter hit a snag. Catch your breath and try again.",
    };
  }
}

export type ApproveResult = { ok: true } | { ok: false; error: string };

// Approve a (reviewed/edited) draft into the library. This is the human-in-the-
// loop gate: a draft only becomes a real drill when a person clicks approve.
export async function approveDraftDrill(
  input: CreateDrillInput & { scope: string | null },
): Promise<ApproveResult> {
  const parsed = CreateDrillSchema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(flattenZodError(parsed.error))[0]?.[0];
    return { ok: false, error: first ?? "That draft isn't valid yet." };
  }

  const current = await getCurrentUser();
  if (!isStaff(current) || !current?.profile?.club_id) {
    return { ok: false, error: "Only coaches and admins can publish drills." };
  }

  const clubId = resolveClubId(current, input.scope);
  const error = await insertDrill(parsed.data, clubId);
  if (error) return { ok: false, error };

  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard/training");
  await logActivity("library", "drill_created", {
    sport: parsed.data.sport,
    ageGroup: parsed.data.ageGroup,
    global: clubId === null,
    source: "ai_draft",
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin "rotate now" — build this week's global Sets on demand (for testing the
// auto-rotation without waiting for the Monday pg_cron run). RLS doesn't gate
// SECURITY DEFINER RPCs, so the function authorises the caller itself (admins +
// the cron context only).
// ---------------------------------------------------------------------------

export type RotateResult = { ok: true; created: number } | { ok: false; error: string };

export async function rotateSets(): Promise<RotateResult> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== "admin") {
    return { ok: false, error: "Only platform admins can rotate Sets." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rotate_weekly_sets");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/challenge");
  revalidatePath("/dashboard");
  const created = (data as number | null) ?? 0;
  await logActivity("challenge", "sets_rotated", { created });
  return { ok: true, created };
}
