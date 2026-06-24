import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AGE_GROUP_LABELS, SPORT_LABELS, type LadderRow } from "@/lib/types";
import { tierForXp, formatXp } from "@/lib/gamification";
import { TierBadge } from "@/components/gamification";
import { TrackView } from "@/components/track-view";

export const metadata: Metadata = { title: "The Ladder · COLT" };

const RANK_MARK = ["🥇", "🥈", "🥉"];

export default async function LadderPage() {
  const current = await getCurrentUser();
  if (!current) return null;

  // RLS (security_invoker on the view) scopes the ladder to the caller's club.
  const supabase = await createClient();
  const { data } = await supabase
    .from("ladder")
    .select("*")
    .order("total_xp", { ascending: false })
    .order("full_name", { ascending: true });
  const rows: LadderRow[] = data ?? [];

  const top = rows[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <TrackView feature="ladder" />
      <section>
        <h1 className="font-display text-3xl text-bone">The Ladder</h1>
        <p className="mt-1 text-bone/60">
          {top && top.total_xp > 0
            ? `${top.full_name} is setting the pace. Climb the ladder — go take it.`
            : "Top of the ladder is empty. Go take it."}
          {current.club ? ` · ${current.club.name}` : ""}
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          No athletes on the ladder yet.{" "}
          <Link href="/dashboard/training" className="text-signal hover:underline">
            Log a session
          </Link>{" "}
          to get climbing.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const tier = tierForXp(r.total_xp);
            const leader = i === 0 && r.total_xp > 0;
            return (
              <li
                key={r.athlete_id}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
                  leader
                    ? "border-signal/40 bg-signal/[0.06]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="w-8 shrink-0 text-center font-display text-lg text-bone/80">
                  {RANK_MARK[i] ?? i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-bone">
                    {r.full_name}
                  </div>
                  <div className="text-xs text-steel">
                    {SPORT_LABELS[r.sport]} · {AGE_GROUP_LABELS[r.age_group]} ·{" "}
                    {r.sessions} {r.sessions === 1 ? "session" : "sessions"}
                  </div>
                </div>
                <TierBadge tier={tier.key} />
                <div className="w-20 shrink-0 text-right font-display text-lg text-signal">
                  {formatXp(r.total_xp)}
                  <span className="ml-1 text-xs text-steel">XP</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
