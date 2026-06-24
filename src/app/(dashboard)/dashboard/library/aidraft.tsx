"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  SPORTS,
  type AgeGroup,
  type Skill,
  type Sport,
} from "@/lib/types";
import { approveDraftDrill, draftDrills, type DraftDrill } from "./actions";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const LABEL = "text-sm font-medium text-bone/80";
const PRIMARY =
  "inline-flex h-11 items-center justify-center self-start rounded-full bg-signal px-6 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100";

const AGES: AgeGroup[] = ["u10", "u13", "u16"];

// A draft the human is reviewing — the AI's suggestion plus edit/approve state.
type ReviewDraft = DraftDrill & {
  sport: Sport;
  ageGroup: AgeGroup;
  status: "pending" | "approving" | "approved";
  error: string | null;
};

function skillsForSport(skills: Skill[], sport: Sport): Skill[] {
  return skills.filter((s) => s.sport === null || s.sport === sport);
}

export function AIDraftTool({
  skills,
  isAdmin,
  aiConfigured,
}: {
  skills: Skill[];
  isAdmin: boolean;
  aiConfigured: boolean;
}) {
  const [sport, setSport] = useState<Sport>("basketball");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("u13");
  const [goal, setGoal] = useState("");
  const [scope, setScope] = useState<"global" | "club">(isAdmin ? "global" : "club");
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDraft() {
    setError(null);
    startTransition(async () => {
      const res = await draftDrills({ sport, ageGroup, goal });
      if (!res.ok) {
        setError(res.message);
        setDrafts([]);
        return;
      }
      setDrafts(
        res.drafts.map((d) => ({
          ...d,
          sport,
          ageGroup,
          status: "pending" as const,
          error: null,
        })),
      );
    });
  }

  function patch(i: number, patch: Partial<ReviewDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function approve(i: number) {
    const d = drafts[i];
    patch(i, { status: "approving", error: null });
    startTransition(async () => {
      const res = await approveDraftDrill({
        title: d.title,
        description: d.description,
        durationMin: d.durationMin,
        sport: d.sport,
        ageGroup: d.ageGroup,
        difficulty: d.difficulty,
        skillIds: d.skillIds,
        scope,
      });
      if (res.ok) patch(i, { status: "approved" });
      else patch(i, { status: "pending", error: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-lg border border-steel/30 bg-steel/10 px-3 py-2 text-sm text-bone/80">
        The AI drafts drills for you to <strong>review, edit, and approve</strong>.
        Nothing reaches the library until you approve it — you&apos;re the coach.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-sport" className={LABEL}>
            Sport
          </label>
          <select
            id="ai-sport"
            value={sport}
            onChange={(e) => setSport(e.target.value as Sport)}
            className={FIELD}
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-age" className={LABEL}>
            Age group
          </label>
          <select
            id="ai-age"
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
            className={FIELD}
          >
            {AGES.map((g) => (
              <option key={g} value={g}>
                {AGE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-1">
            <label htmlFor="ai-scope" className={LABEL}>
              Approve as
            </label>
            <select
              id="ai-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as "global" | "club")}
              className={FIELD}
            >
              <option value="global">Global</option>
              <option value="club">This club</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ai-goal" className={LABEL}>
          Goal / focus
        </label>
        <input
          id="ai-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className={FIELD}
          placeholder="Improve acceleration off the mark"
          autoComplete="off"
          maxLength={300}
        />
      </div>

      <button
        type="button"
        onClick={onDraft}
        disabled={pending || !aiConfigured}
        className={PRIMARY}
        title={aiConfigured ? undefined : "Add an ANTHROPIC_API_KEY to enable the drafter"}
      >
        {pending && drafts.length === 0 ? "Drafting…" : "Draft 3 drills"}
      </button>

      {!aiConfigured && (
        <p className="text-xs text-steel">
          The AI drafter isn&apos;t switched on yet — add a real ANTHROPIC_API_KEY
          and it&apos;ll start drafting drills for you to review.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">
          {error}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-steel">
            Review &amp; approve
          </h3>
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              skills={skills}
              onChange={(p) => patch(i, p)}
              onApprove={() => approve(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  skills,
  onChange,
  onApprove,
}: {
  draft: ReviewDraft;
  skills: Skill[];
  onChange: (patch: Partial<ReviewDraft>) => void;
  onApprove: () => void;
}) {
  const available = useMemo(
    () => skillsForSport(skills, draft.sport),
    [skills, draft.sport],
  );
  const selected = new Set(draft.skillIds);

  function toggleSkill(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ skillIds: [...next] });
  }

  const approved = draft.status === "approved";

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 ${
        approved ? "border-signal/50 bg-signal/[0.06]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {approved ? (
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-bone">{draft.title}</div>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-signal">
            Approved ✓
          </span>
        </div>
      ) : (
        <>
          <input
            value={draft.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={`${FIELD} font-semibold`}
            placeholder="Drill title"
          />
          <textarea
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className={FIELD}
            placeholder="How to run it"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-steel">
              Minutes
              <input
                type="number"
                min={1}
                max={180}
                value={draft.durationMin}
                onChange={(e) =>
                  onChange({ durationMin: Number(e.target.value) || 1 })
                }
                className="w-20 rounded-lg border border-white/15 bg-ink px-2 py-1 text-sm text-bone outline-none focus:border-signal"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-steel">
              Difficulty
              <select
                value={draft.difficulty}
                onChange={(e) => onChange({ difficulty: Number(e.target.value) })}
                className="rounded-lg border border-white/15 bg-ink px-2 py-1 text-sm text-bone outline-none focus:border-signal"
              >
                <option value={1}>1 · Intro</option>
                <option value={2}>2 · Building</option>
                <option value={3}>3 · Advanced</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {available.map((s) => {
              const on = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSkill(s.id)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    on
                      ? "border-signal bg-signal text-ink"
                      : "border-white/15 text-bone/70 hover:bg-white/5"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {draft.error && <p className="text-xs text-signal">{draft.error}</p>}
          <button
            type="button"
            onClick={onApprove}
            disabled={draft.status === "approving"}
            className="self-start rounded-full bg-signal px-5 py-2 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {draft.status === "approving" ? "Approving…" : "Approve to library"}
          </button>
        </>
      )}
    </div>
  );
}
