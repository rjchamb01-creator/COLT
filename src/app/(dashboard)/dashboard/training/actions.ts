"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import type { CompleteDrillResult } from "@/lib/types";

export type LogSessionResult =
  | { ok: true; result: CompleteDrillResult }
  | { ok: false; error: string };

// Log a completed Training Library session for an athlete. The complete_drill
// RPC awards XP (= drill minutes), grants any newly-earned caps, and returns the
// level-up summary the UI celebrates with.
export async function logSession(
  athleteId: string,
  drillId: string,
): Promise<LogSessionResult> {
  if (!athleteId) return { ok: false, error: "Pick an athlete first." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_drill", {
    p_athlete_id: athleteId,
    p_drill_id: drillId,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as CompleteDrillResult;

  // Refresh the dashboard, ladder, and Matchday Challenge so XP, tiers, the
  // ladder, and Set progress all reflect the session just logged.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ladder");
  revalidatePath("/dashboard/challenge");
  // The personalised Weekly Program shares the drill-XP ledger for its progress.
  revalidatePath("/dashboard/program");

  // Engagement telemetry — a logged session is the core "what people DO" action;
  // a finished Set is the headline weekly action. Best-effort (never blocks).
  await logActivity("training", "session_logged", { xp: result.xp_gained });
  if (result.set_completed) {
    await logActivity("challenge", "set_completed", { bonus: result.set_bonus_xp });
  }

  return { ok: true, result };
}
