// Server-side helpers for loading the authenticated user's profile + club.
import { createClient } from "@/lib/supabase/server";
import type { Club, Profile } from "@/lib/types";

export interface CurrentUser {
  id: string;
  email: string | undefined;
  profile: Profile | null;
  club: Club | null;
}

// Returns the signed-in user along with their profile and club, or null when
// not authenticated. Route protection lives in the proxy; this is for reading.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let club: Club | null = null;
  if (profile?.club_id) {
    const { data } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", profile.club_id)
      .maybeSingle();
    club = data ?? null;
  }

  return { id: user.id, email: user.email, profile: profile ?? null, club };
}
