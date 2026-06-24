import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  ROLE_LABELS,
  SPORT_LABELS,
  type ActivityEvent,
  type Club,
  type Drill,
  type DrillSkill,
  type Skill,
  type UserRole,
  type XpEvent,
} from "@/lib/types";

export const metadata: Metadata = { title: "Engagement Insights · COLT" };

// Friendly labels for the tracked features.
const FEATURE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  squad: "The Squad",
  training: "Training Library",
  challenge: "Matchday Challenge",
  ladder: "The Ladder",
  athletes: "Athletes",
  coach: "AI Coach",
  library: "Content Library",
};

// Friendly labels for the domain ACTIONS (everything that isn't a page view).
const ACTION_LABELS: Record<string, string> = {
  session_logged: "Sessions logged",
  set_completed: "Sets completed",
  announcement_posted: "Posts to the Squad",
  session_scheduled: "Sessions scheduled",
  athlete_added: "Athletes added",
  message: "AI Coach messages",
  drill_created: "Drills authored",
  drill_updated: "Drills edited",
  sets_rotated: "Weekly Sets rotated",
};

const WINDOW_DAYS = 30;

// Platform-admin engagement readout — Phase 1 telemetry on which features people
// lean on, so the data (not a guess) decides where the Phase 2 paywall goes.
// This is intentionally admin-only business telemetry, NOT a club/parent insight
// dashboard (that's the paid Phase 2 lever). RLS already restricts reads to
// admins; this page also redirects non-admins as defence in depth.
export default async function InsightsPage() {
  const current = await getCurrentUser();
  if (!current) return null;
  if (current.profile?.role !== "admin") redirect("/dashboard");

  const sinceIso = new Date(
    new Date().getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = await createClient();
  const [eventRes, clubRes, drillEventRes, drillRes, linkRes, skillRes] =
    await Promise.all([
      supabase.from("activity_events").select("*").gte("created_at", sinceIso),
      supabase.from("clubs").select("*"),
      // Drill completions (the "what gets trained" signal) — one row per logged
      // session. Admin RLS returns these across all clubs.
      supabase
        .from("xp_events")
        .select("drill_id")
        .eq("source", "drill")
        .gte("created_at", sinceIso),
      supabase.from("drills").select("id, title, sport, age_group"),
      supabase.from("drill_skills").select("drill_id, skill_id"),
      supabase.from("skills").select("id, label"),
    ]);
  const events: ActivityEvent[] = eventRes.data ?? [];
  const clubs: Club[] = clubRes.data ?? [];
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));

  // What people actually train — the signal that tells us which paid features
  // (personalised programs by goal/skill) people would lean on. A drill
  // completion counts toward the drill and toward every skill it carries.
  const drillEvents = (drillEventRes.data ?? []) as Pick<XpEvent, "drill_id">[];
  const drills = (drillRes.data ?? []) as Pick<
    Drill,
    "id" | "title" | "sport" | "age_group"
  >[];
  const links = (linkRes.data ?? []) as Pick<DrillSkill, "drill_id" | "skill_id">[];
  const skillList = (skillRes.data ?? []) as Pick<Skill, "id" | "label">[];

  const drillById = new Map(drills.map((d) => [d.id, d]));
  const skillLabel = new Map(skillList.map((s) => [s.id, s.label]));
  const skillsByDrill = new Map<string, string[]>();
  for (const l of links) {
    const arr = skillsByDrill.get(l.drill_id) ?? [];
    arr.push(l.skill_id);
    skillsByDrill.set(l.drill_id, arr);
  }

  const drillCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();
  for (const e of drillEvents) {
    if (!e.drill_id) continue;
    drillCounts.set(e.drill_id, (drillCounts.get(e.drill_id) ?? 0) + 1);
    for (const sid of skillsByDrill.get(e.drill_id) ?? []) {
      skillCounts.set(sid, (skillCounts.get(sid) ?? 0) + 1);
    }
  }

  const topDrills = [...drillCounts.entries()]
    .map(([id, count]) => ({ drill: drillById.get(id), count }))
    .filter((r): r is { drill: NonNullable<typeof r.drill>; count: number } =>
      Boolean(r.drill),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topSkills = [...skillCounts.entries()]
    .map(([id, count]) => ({ label: skillLabel.get(id) ?? "skill", count }))
    .sort((a, b) => b.count - a.count);
  const drillMax = Math.max(1, ...topDrills.map((d) => d.count));
  const skillMax = Math.max(1, ...topSkills.map((s) => s.count));
  const totalCompletions = drillEvents.length;

  // Split telemetry by action. Feature VIEWS (from TrackView) are "what people
  // open" and drive the engagement breakdowns; every other action is something
  // they DID (logged a session, finished a Set, posted, etc.) — the stronger
  // signal for the Phase 2 paywall decision. Kept apart so actions never inflate
  // view counts.
  const views = events.filter((e) => e.action === "view");
  const actions = events.filter((e) => e.action !== "view");

  // Aggregations (over views).
  const total = views.length;
  const activeUsers = new Set(views.map((e) => e.profile_id)).size;

  const byFeature = tally(views.map((e) => e.feature));
  const byRole = tally(views.map((e) => e.role));

  // What people DID, by action type.
  const byAction = tally(actions.map((e) => e.action));
  const actionMax = Math.max(1, ...[...byAction.values()]);

  // Per-club engagement, with parent activity broken out — parent conversion is
  // the headline KPI, so parent engagement per club is the signal that matters.
  type ClubStat = {
    clubId: string;
    total: number;
    parentViews: number;
    parents: Set<string>;
  };
  const clubStats = new Map<string, ClubStat>();
  for (const e of views) {
    const s =
      clubStats.get(e.club_id) ??
      { clubId: e.club_id, total: 0, parentViews: 0, parents: new Set<string>() };
    s.total += 1;
    if (e.role === "parent") {
      s.parentViews += 1;
      s.parents.add(e.profile_id);
    }
    clubStats.set(e.club_id, s);
  }
  const clubRows = [...clubStats.values()].sort((a, b) => b.total - a.total);

  const featureMax = Math.max(1, ...[...byFeature.values()]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <section>
        <h1 className="font-display text-3xl text-bone">
          Engagement Insights
        </h1>
        <p className="mt-1 text-bone/60">
          What the squads actually lean on — the last {WINDOW_DAYS} days. This is
          the data that decides where premium lands.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {total === 0 && actions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-steel">
          No activity tracked yet. As clubs, coaches, and parents move through the
          app, their views and actions land here.
        </p>
      ) : (
        <>
          {/* Headline numbers. */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Feature views" value={total.toLocaleString("en-US")} />
            <StatCard
              label="Actions taken"
              value={actions.length.toLocaleString("en-US")}
            />
            <StatCard
              label="Active members"
              value={activeUsers.toLocaleString("en-US")}
            />
            <StatCard
              label="Parent views"
              value={(byRole.get("parent") ?? 0).toLocaleString("en-US")}
              accent
            />
          </section>

          {/* What people open most. */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
              Most-used features
            </h2>
            <ul className="flex flex-col gap-2.5">
              {[...byFeature.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([feature, count]) => (
                  <li key={feature} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-bone">
                        {FEATURE_LABELS[feature] ?? feature}
                      </span>
                      <span className="text-steel">
                        {count.toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="climb-fill absolute inset-y-0 left-0 rounded-full bg-signal"
                        style={{ width: `${Math.max((count / featureMax) * 100, 3)}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          </section>

          {/* What people DO — the stronger signal for the paywall decision. */}
          {actions.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
                Actions taken
              </h2>
              <ul className="flex flex-col gap-2.5">
                {[...byAction.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, count]) => (
                    <li key={action} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-bone">
                          {ACTION_LABELS[action] ?? action}
                        </span>
                        <span className="text-steel">
                          {count.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="climb-fill absolute inset-y-0 left-0 rounded-full bg-steel"
                          style={{ width: `${Math.max((count / actionMax) * 100, 3)}%` }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {/* What people actually train — the paid-feature signal. A drill
              completion counts toward the drill and each skill it carries. */}
          {totalCompletions > 0 && (
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-steel">
                What gets trained
              </h2>
              <p className="mb-3 text-xs text-steel">
                {totalCompletions.toLocaleString("en-US")} drill completions in the
                window — which goals & drills people lean on points at where a
                personalised-program paywall would land.
              </p>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">
                    Most-trained skills
                  </h3>
                  {topSkills.length === 0 ? (
                    <p className="text-sm text-steel">
                      No tagged drills logged yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {topSkills.map((s) => (
                        <li key={s.label} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="text-bone">{s.label}</span>
                            <span className="text-steel">
                              {s.count.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="climb-fill absolute inset-y-0 left-0 rounded-full bg-steel"
                              style={{ width: `${Math.max((s.count / skillMax) * 100, 3)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">
                    Most-logged drills
                  </h3>
                  <ul className="flex flex-col gap-2.5">
                    {topDrills.map(({ drill, count }) => (
                      <li key={drill.id} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-bone" title={drill.title}>
                            {drill.title}
                            <span className="ml-1 text-xs text-steel">
                              {SPORT_LABELS[drill.sport]} ·{" "}
                              {AGE_GROUP_LABELS[drill.age_group]}
                            </span>
                          </span>
                          <span className="shrink-0 text-steel">
                            {count.toLocaleString("en-US")}
                          </span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="climb-fill absolute inset-y-0 left-0 rounded-full bg-signal"
                            style={{ width: `${Math.max((count / drillMax) * 100, 3)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Who's engaging. */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
              By role
            </h2>
            <div className="flex flex-wrap gap-2">
              {[...byRole.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <span
                    key={role}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      role === "parent"
                        ? "border-signal/50 bg-signal/10 text-signal"
                        : "border-white/15 text-bone/75"
                    }`}
                  >
                    {ROLE_LABELS[role as UserRole] ?? role}:{" "}
                    <span className="font-semibold">
                      {count.toLocaleString("en-US")}
                    </span>
                  </span>
                ))}
            </div>
          </section>

          {/* Per-club, parent engagement highlighted (the conversion signal). */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
              By club · parent engagement is the conversion signal
            </h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-steel">
                    <th className="px-4 py-2.5 font-semibold">Club</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Total views
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Parent views
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Active parents
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clubRows.map((s) => (
                    <tr
                      key={s.clubId}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-bone">
                        {clubName.get(s.clubId) ?? "Unknown club"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-bone/75">
                        {s.total.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-signal">
                        {s.parentViews.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-bone/75">
                        {s.parents.size.toLocaleString("en-US")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-signal/30 bg-signal/[0.04]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-steel">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-3xl ${
          accent ? "text-signal" : "text-bone"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// Count occurrences of each string into an insertion-ordered map.
function tally(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
