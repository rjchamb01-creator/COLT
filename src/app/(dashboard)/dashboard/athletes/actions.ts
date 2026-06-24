"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  CreateAthleteSchema,
  flattenZodError,
  type AuthFormState,
} from "@/lib/validation";

// Add an athlete to the caller's club. RLS (athletes_insert) already gates this:
// club_id must be the caller's club, and parent_id must be the caller unless they
// are a coach/club_admin/admin. We mirror that here — a parent (or athlete) owns
// the athletes they add; coaches/admins add club players with no parent link.
export async function createAthlete(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = CreateAthleteSchema.safeParse({
    fullName: formData.get("fullName"),
    sport: formData.get("sport"),
    ageGroup: formData.get("ageGroup"),
  });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const current = await getCurrentUser();
  if (!current?.profile?.club_id) {
    return { message: "Join or create a club before adding athletes." };
  }

  const role = current.profile.role;
  const parentId = role === "parent" || role === "athlete" ? current.id : null;

  const supabase = await createClient();
  const { error } = await supabase.from("athletes").insert({
    club_id: current.profile.club_id,
    parent_id: parentId,
    full_name: parsed.data.fullName,
    sport: parsed.data.sport,
    age_group: parsed.data.ageGroup,
  });
  if (error) {
    return { message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/athletes");
  revalidatePath("/dashboard/training"); // so the new athlete is selectable in "Log session"
  await logActivity("athletes", "athlete_added", {
    sport: parsed.data.sport,
    ageGroup: parsed.data.ageGroup,
  });
  return { success: `${parsed.data.fullName} is on the squad — let the climb begin.` };
}

export type InviteResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

// Mint a single-use player-claim token for an athlete (13+ self-signup link).
// create_athlete_invite enforces who may invite (managing parent / club staff)
// and refuses already-claimed athletes; we just surface the token.
export async function generateInvite(athleteId: string): Promise<InviteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_athlete_invite", {
    p_athlete_id: athleteId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token: data as string };
}
