"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  LoginSchema,
  SignupSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  flattenZodError,
  type AuthFormState,
} from "@/lib/validation";

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Seeds public.profiles via the handle_new_user() trigger.
      data: { full_name: parsed.data.fullName, role: "parent" },
    },
  });

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// Send a password-reset email. The link points back through /auth/callback
// (which exchanges the recovery code for a session) to /reset-password. We always
// report success so the form can't be used to probe which emails have accounts.
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return {
    success:
      "If that email has an account, a reset link is on its way — check your inbox.",
  };
}

// Set a new password. Reached only after the recovery link establishes a session
// (via /auth/callback), so updateUser() applies to the right account.
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = ResetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
