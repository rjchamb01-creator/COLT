// Engagement telemetry writer (server-only). Best-effort: logging must NEVER
// break the action it's instrumenting, so every failure is swallowed.
//
// `view` rows come from the <TrackView> client component (via src/lib/track.ts);
// the other actions are domain events logged from Server Actions after the work
// succeeds. RLS (activity_events_insert) is the real guard — it only allows a row
// for the caller's own profile + club + role, which is exactly what we write.
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Feature } from "@/lib/types";

// The actions we record. 'view' = a page open; the rest are domain events.
export type ActivityAction =
  | "view"
  | "session_logged"
  | "set_completed"
  | "announcement_posted"
  | "session_scheduled"
  | "athlete_added"
  | "drill_created"
  | "drill_updated"
  | "sets_rotated"
  | "checkout_started"
  | "program_built";

export async function logActivity(
  feature: Feature | string,
  action: ActivityAction = "view",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const current = await getCurrentUser();
    // Anon / pre-onboarding — nothing to attribute.
    if (!current?.profile?.club_id) return;

    const supabase = await createClient();
    await supabase.from("activity_events").insert({
      club_id: current.profile.club_id,
      profile_id: current.id,
      role: current.profile.role,
      feature,
      action,
      metadata,
    });
  } catch {
    // Swallow — instrumentation is best-effort and must not affect UX.
  }
}
