import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type Athlete,
} from "@/lib/types";
import { AthleteForm } from "./athlete-form";
import { PlayerInvite } from "./player-invite";
import { TrackView } from "@/components/track-view";

export const metadata: Metadata = { title: "Athletes · COLT" };

export default async function AthletesPage() {
  const current = await getCurrentUser();
  // Layout already guards this, but narrow the type for TS.
  if (!current) return null;

  // RLS scopes this to the caller's club automatically.
  const supabase = await createClient();
  const { data } = await supabase.from("athletes").select("*").order("full_name");
  const athletes: Athlete[] = data ?? [];

  const role = current.profile?.role;
  const isParent = role === "parent" || role === "athlete";
  const isStaff = role === "coach" || role === "club_admin" || role === "admin";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <TrackView feature="athletes" />
      <section>
        <h1 className="font-display text-3xl text-bone">Athletes</h1>
        <p className="mt-1 text-bone/60">
          {isParent
            ? "Add your athletes, then start logging sessions to climb the ladder."
            : `Add players to ${current.club?.name ?? "your club"} so they can start banking XP.`}
        </p>
        <div className="climb-divider mt-4" />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="mb-4 font-display text-lg text-bone">Add an athlete</h2>
        <AthleteForm />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
          {athletes.length} {athletes.length === 1 ? "athlete" : "athletes"}
          {current.club ? ` · ${current.club.name}` : ""}
        </h2>
        {athletes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
            No athletes yet — add your first one above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {athletes.map((a) => {
              const canInvite = isStaff || a.parent_id === current.id;
              const linked = a.profile_id !== null;
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div>
                    <div className="font-semibold text-bone">{a.full_name}</div>
                    <div className="mt-1 text-sm text-steel">
                      {SPORT_LABELS[a.sport]} · {AGE_GROUP_LABELS[a.age_group]}
                    </div>
                  </div>
                  {/* Player accounts: link status / invite (13+ self-signup). */}
                  {linked ? (
                    <PlayerInvite athleteId={a.id} linked />
                  ) : canInvite ? (
                    <PlayerInvite athleteId={a.id} linked={false} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
