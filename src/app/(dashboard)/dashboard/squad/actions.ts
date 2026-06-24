"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  CreateAnnouncementSchema,
  CreateEventSchema,
  flattenZodError,
  type AuthFormState,
} from "@/lib/validation";

// Post an announcement to the Squad. RLS (announcements_insert) is the security
// boundary — it gates this to a coach/club_admin/admin posting to their OWN club;
// the action just supplies club_id + author_id and inserts.
export async function createAnnouncement(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = CreateAnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const current = await getCurrentUser();
  if (!current?.profile?.club_id) {
    return { message: "Join or create a club before posting to your Squad." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    club_id: current.profile.club_id,
    author_id: current.id,
    title: parsed.data.title,
    body: parsed.data.body,
  });
  if (error) {
    return { message: error.message };
  }

  revalidatePath("/dashboard/squad");
  revalidatePath("/dashboard");
  await logActivity("squad", "announcement_posted");
  return { success: "Posted to the Squad. They'll see it." };
}

// Schedule a training session. Same RLS gate as announcements. Schedule-only —
// no attendance/RSVP (that's a Phase 2 paid lever). sport / age_group are
// optional cohort targeting (left blank = the whole Squad).
export async function createEvent(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = CreateEventSchema.safeParse({
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    location: formData.get("location"),
    description: formData.get("description"),
    sport: formData.get("sport"),
    ageGroup: formData.get("ageGroup"),
  });
  if (!parsed.success) {
    return { errors: flattenZodError(parsed.error) };
  }

  const current = await getCurrentUser();
  if (!current?.profile?.club_id) {
    return { message: "Join or create a club before scheduling sessions." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    club_id: current.profile.club_id,
    title: parsed.data.title,
    starts_at: new Date(parsed.data.startsAt).toISOString(),
    location: parsed.data.location || null,
    description: parsed.data.description || null,
    sport: parsed.data.sport ?? null,
    age_group: parsed.data.ageGroup ?? null,
  });
  if (error) {
    return { message: error.message };
  }

  revalidatePath("/dashboard/squad");
  revalidatePath("/dashboard");
  await logActivity("squad", "session_scheduled", {
    sport: parsed.data.sport ?? null,
    ageGroup: parsed.data.ageGroup ?? null,
  });
  return { success: "Session locked in. Tell the Squad to show up." };
}
