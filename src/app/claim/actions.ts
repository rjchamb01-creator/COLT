"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ClaimSignupSchema,
  flattenZodError,
  type AuthFormState,
} from "@/lib/validation";
import type { AthleteInvitePreview } from "@/lib/types";

// A 13+ athlete signs up through an invite link and claims their record in one
// step: verify the token → create the account → link it via claim_athlete (which
// also sets role='athlete' and pins them to the athlete's club). RLS + the RPC
// are the real guards; this just orchestrates.
export async function claimSignup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { message: "This invite link is missing its code." };

  const parsed = ClaimSignupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    over13: formData.get("over13"),
  });
  if (!parsed.success) return { errors: flattenZodError(parsed.error) };

  const supabase = await createClient();

  // Verify the invite BEFORE creating an account, so a bad link never leaves an
  // orphan login behind.
  const { data: preview } = await supabase.rpc("peek_athlete_invite", {
    p_token: token,
  });
  if (!(preview as AthleteInvitePreview | null)) {
    return { message: "That invite is invalid or has already been used." };
  }

  const { error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName, role: "athlete" } },
  });
  if (signUpError) return { message: signUpError.message };

  const { error: claimError } = await supabase.rpc("claim_athlete", {
    p_token: token,
  });
  if (claimError) return { message: claimError.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// Already signed in (e.g. opened the link in a logged-in session) → just link.
// claim_athlete refuses staff accounts and accounts that manage athletes, so a
// parent/coach can't accidentally convert their own account into a player.
export async function claimExisting(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { message: "This invite link is missing its code." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_athlete", { p_token: token });
  if (error) return { message: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
