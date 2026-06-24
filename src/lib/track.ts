"use server";

import type { Feature } from "@/lib/types";
import { logActivity } from "@/lib/activity";

// Log a feature VIEW for the current user (Phase 1 engagement telemetry). Called
// fire-and-forget from the <TrackView> client component on mount. Thin wrapper
// over logActivity — see src/lib/activity.ts for the (best-effort) write + the
// RLS guard. There is deliberately NO revalidatePath: logging a view must never
// re-render the user's screen.
export async function trackView(feature: Feature): Promise<void> {
  await logActivity(feature, "view");
}
