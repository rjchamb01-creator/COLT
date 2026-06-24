import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isCoachConfigured } from "@/lib/anthropic";
import type { Drill, DrillSkill, Skill } from "@/lib/types";
import { TrackView } from "@/components/track-view";
import { LibraryManager, type EditableDrill } from "./library-manager";
import { RotateNow } from "./rotate-now";

export const metadata: Metadata = { title: "Content Library · COLT" };

// The authoring hub for the Training Content Engine: write drills by hand, draft
// them with AI (human-in-the-loop), and tag them with skills. Staff only —
// coaches/club_admins author their club's drills; admins also author global
// content. RLS enforces all of this regardless; this page just gates the UI.
export default async function LibraryPage() {
  const current = await getCurrentUser();
  if (!current) return null;

  const role = current.profile?.role;
  const isStaff = role === "coach" || role === "club_admin" || role === "admin";
  // Parents/athletes don't author — send them to the browse experience.
  if (!isStaff) redirect("/dashboard/training");
  const isAdmin = role === "admin";

  const supabase = await createClient();

  // The skill vocabulary (shared lookup, readable by all authenticated).
  const { data: skillRows } = await supabase
    .from("skills")
    .select("*")
    .order("label");
  const skills: Skill[] = skillRows ?? [];

  // The drills this user can edit: own-club drills for coach/club_admin; all
  // drills (incl. global) for admins. Newest first.
  let drillQuery = supabase
    .from("drills")
    .select("*")
    .order("created_at", { ascending: false });
  if (!isAdmin) {
    drillQuery = drillQuery.eq("club_id", current.profile?.club_id ?? "");
  }
  const { data: drillRows } = await drillQuery;
  const drills: Drill[] = drillRows ?? [];

  // Their skill tags, in one query, mapped drill_id → skillIds.
  const skillsByDrill = new Map<string, string[]>();
  if (drills.length > 0) {
    const { data: linkRows } = await supabase
      .from("drill_skills")
      .select("*")
      .in(
        "drill_id",
        drills.map((d) => d.id),
      );
    for (const link of (linkRows ?? []) as DrillSkill[]) {
      const list = skillsByDrill.get(link.drill_id) ?? [];
      list.push(link.skill_id);
      skillsByDrill.set(link.drill_id, list);
    }
  }

  const editableDrills: EditableDrill[] = drills.map((d) => ({
    ...d,
    skillIds: skillsByDrill.get(d.id) ?? [],
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <TrackView feature="library" />
      <section>
        <h1 className="font-display text-3xl text-bone">Content Library</h1>
        <p className="mt-1 text-bone/60">
          Keep the Training Library fresh. Write a drill, or let the AI draft a
          few for you to sharpen and approve — then tag them so they show up
          everywhere players are looking.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {isAdmin && <RotateNow />}

      <LibraryManager
        skills={skills}
        drills={editableDrills}
        isAdmin={isAdmin}
        aiConfigured={isCoachConfigured()}
      />
    </div>
  );
}
