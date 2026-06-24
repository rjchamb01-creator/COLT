"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CreateClubSchema,
  JoinClubSchema,
  flattenZodError,
  type AuthFormState,
} from "@/lib/validation";

export async function createClub(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = CreateClubSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_club", { p_name: parsed.data.name });
  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function joinClub(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = JoinClubSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_club", { p_code: parsed.data.code });
  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
