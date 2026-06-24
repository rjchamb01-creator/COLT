import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  SPORTS,
  type AgeGroup,
  type Athlete,
  type Drill,
  type DrillSkill,
  type Skill,
  type Sport,
} from "@/lib/types";
import { LogSession } from "./log-session";
import { TrackView } from "@/components/track-view";
import { DrillVideo } from "@/components/drill-video";

export const metadata: Metadata = {
  title: "Training Library · COLT",
};

// Narrow a raw query-param value to a known enum member, else undefined.
function asSport(v: string | string[] | undefined): Sport | undefined {
  return typeof v === "string" && (SPORTS as string[]).includes(v)
    ? (v as Sport)
    : undefined;
}
function asAgeGroup(v: string | string[] | undefined): AgeGroup | undefined {
  return v === "u10" || v === "u13" || v === "u16" ? v : undefined;
}

// Build a /dashboard/training URL carrying the given filter selection. `skill`
// is a skill key (from the taxonomy); undefined clears that facet.
function filterHref(sport?: Sport, age?: AgeGroup, skill?: string): string {
  const params = new URLSearchParams();
  if (sport) params.set("sport", sport);
  if (age) params.set("age", age);
  if (skill) params.set("skill", skill);
  const qs = params.toString();
  return qs ? `/dashboard/training?${qs}` : "/dashboard/training";
}

function pill(active: boolean): string {
  return [
    "rounded-full border px-3 py-1.5 text-sm transition-colors",
    active
      ? "border-signal bg-signal text-ink font-semibold"
      : "border-white/15 text-bone/70 hover:bg-white/5",
  ].join(" ");
}

export default async function TrainingLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const current = await getCurrentUser();
  // Layout already guards this, but narrow the type for TS.
  if (!current) return null;

  const sp = await searchParams;
  const sport = asSport(sp.sport);
  const age = asAgeGroup(sp.age);
  const skillKey = typeof sp.skill === "string" ? sp.skill : undefined;

  const supabase = await createClient();

  // Entitlement seam: premium ("Pro") drills are hidden from the drills query by
  // RLS unless the caller is entitled (Tier 1+) — so we don't filter them here.
  // We just ask how many are locked, to show the upsell teaser (0 once entitled).
  const { data: lockedCount } = await supabase.rpc("locked_premium_count");
  const lockedPremium = (lockedCount as number | null) ?? 0;

  // The skill vocabulary drives the filter row + the tags on each card.
  const { data: skillRows } = await supabase
    .from("skills")
    .select("*")
    .order("label");
  const skills: Skill[] = skillRows ?? [];
  const skillByKey = new Map(skills.map((s) => [s.key, s]));
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const activeSkill = skillKey ? skillByKey.get(skillKey) : undefined;

  // When filtering by skill, first resolve which drills carry it (RLS scopes
  // drill_skills the same way as drills), then constrain the drill query.
  let skillDrillIds: string[] | null = null;
  if (activeSkill) {
    const { data: links } = await supabase
      .from("drill_skills")
      .select("drill_id")
      .eq("skill_id", activeSkill.id);
    skillDrillIds = [...new Set((links ?? []).map((l) => l.drill_id))];
  }

  // RLS returns global drills (club_id IS NULL) plus this club's own drills.
  // When a skill filter resolves to zero drills, skip the query entirely (an
  // empty `.in()` of UUIDs would be a malformed query).
  let drills: Drill[] = [];
  if (skillDrillIds === null || skillDrillIds.length > 0) {
    let query = supabase.from("drills").select("*");
    if (sport) query = query.eq("sport", sport);
    if (age) query = query.eq("age_group", age);
    if (skillDrillIds !== null) query = query.in("id", skillDrillIds);
    const { data } = await query.order("title");
    drills = data ?? [];
  }

  // Skill tags for the drills on screen, mapped drill_id → Skill[].
  const tagsByDrill = new Map<string, Skill[]>();
  if (drills.length > 0) {
    const { data: linkRows } = await supabase
      .from("drill_skills")
      .select("*")
      .in(
        "drill_id",
        drills.map((d) => d.id),
      );
    for (const link of (linkRows ?? []) as DrillSkill[]) {
      const s = skillById.get(link.skill_id);
      if (!s) continue;
      const list = tagsByDrill.get(link.drill_id) ?? [];
      list.push(s);
      tagsByDrill.set(link.drill_id, list);
    }
  }

  // Athletes XP is attributed to when a session is logged (RLS-scoped to club).
  const { data: athleteData } = await supabase
    .from("athletes")
    .select("*")
    .order("full_name");
  const athletes: Pick<Athlete, "id" | "full_name">[] = (athleteData ?? []).map(
    (a) => ({ id: a.id, full_name: a.full_name }),
  );

  const ages: AgeGroup[] = ["u10", "u13", "u16"];
  // Skill filter options — narrowed to the selected sport (global + that sport).
  const filterSkills = skills.filter(
    (s) => s.sport === null || !sport || s.sport === sport,
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <TrackView feature="training" />
      <section>
        <h1 className="font-display text-3xl text-bone">Training Library</h1>
        <p className="mt-1 text-bone/60">
          Pick a drill, put in the work, log it — every session banks XP and moves
          you up the ladder.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {lockedPremium > 0 && (
        <Link
          href="/dashboard/billing"
          className="flex items-center justify-between gap-4 rounded-xl border border-signal/40 bg-signal/10 p-4 transition-colors hover:bg-signal/15"
        >
          <div>
            <div className="font-semibold text-bone">
              {lockedPremium} pro {lockedPremium === 1 ? "drill" : "drills"} locked
            </div>
            <div className="text-sm text-bone/70">
              Unlock the deeper, position-specific library with a Tier 1 membership.
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-signal px-4 py-2 text-sm font-semibold text-ink">
            Unlock
          </span>
        </Link>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-steel">
            Sport
          </span>
          <Link href={filterHref(undefined, age, skillKey)} className={pill(!sport)}>
            All
          </Link>
          {SPORTS.map((s) => (
            <Link
              key={s}
              href={filterHref(s, age, skillKey)}
              className={pill(sport === s)}
            >
              {SPORT_LABELS[s]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-steel">
            Age
          </span>
          <Link href={filterHref(sport, undefined, skillKey)} className={pill(!age)}>
            All
          </Link>
          {ages.map((g) => (
            <Link
              key={g}
              href={filterHref(sport, g, skillKey)}
              className={pill(age === g)}
            >
              {AGE_GROUP_LABELS[g]}
            </Link>
          ))}
        </div>
        {filterSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-steel">
              Skill
            </span>
            <Link
              href={filterHref(sport, age, undefined)}
              className={pill(!skillKey)}
            >
              All
            </Link>
            {filterSkills.map((s) => (
              <Link
                key={s.id}
                href={filterHref(sport, age, s.key)}
                className={pill(skillKey === s.key)}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
          {drills.length} {drills.length === 1 ? "drill" : "drills"}
        </h2>
        {drills.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
            No drills match these filters yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {drills.map((d) => (
              <li
                key={d.id}
                className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-bone">{d.title}</div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {d.is_premium && (
                      <span className="rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-xs font-semibold text-signal">
                        Pro
                      </span>
                    )}
                    {d.club_id === null && (
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-steel">
                        Global
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm text-steel">
                  {SPORT_LABELS[d.sport]} · {AGE_GROUP_LABELS[d.age_group]} ·{" "}
                  <span className="text-signal">+{d.duration_min} XP</span>
                </div>
                <p className="mt-2 text-sm text-bone/70">{d.description}</p>
                {(tagsByDrill.get(d.id)?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tagsByDrill.get(d.id)!.map((s) => (
                      <span
                        key={s.id}
                        className="rounded-full border border-steel/40 bg-steel/10 px-2 py-0.5 text-xs text-steel"
                      >
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
                <DrillVideo url={d.video_url} title={d.title} />
                <LogSession drillId={d.id} athletes={athletes} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
