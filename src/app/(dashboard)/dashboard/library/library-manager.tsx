"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  SPORTS,
  type AgeGroup,
  type Drill,
  type Skill,
  type Sport,
} from "@/lib/types";
import type { AuthFormState } from "@/lib/validation";
import { createDrill, updateDrill } from "./actions";
import { AIDraftTool } from "./aidraft";

export type EditableDrill = Drill & { skillIds: string[] };

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const ERR = "text-xs text-signal";
const LABEL = "text-sm font-medium text-bone/80";
const PRIMARY =
  "mt-1 inline-flex h-11 items-center justify-center self-start rounded-full bg-signal px-6 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100";

const AGES: AgeGroup[] = ["u10", "u13", "u16"];

type Tab = "write" | "ai";

export function LibraryManager({
  skills,
  drills,
  isAdmin,
  aiConfigured,
}: {
  skills: Skill[];
  drills: EditableDrill[];
  isAdmin: boolean;
  aiConfigured: boolean;
}) {
  const [tab, setTab] = useState<Tab>("write");
  const [editing, setEditing] = useState<EditableDrill | null>(null);

  function startEdit(drill: EditableDrill) {
    setEditing(drill);
    setTab("write");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="mb-5 flex items-center gap-2">
          <TabButton active={tab === "write"} onClick={() => setTab("write")}>
            {editing ? "Edit drill" : "Write a drill"}
          </TabButton>
          <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
            AI draft
          </TabButton>
        </div>

        {tab === "write" ? (
          <DrillForm
            key={editing?.id ?? "new"}
            skills={skills}
            isAdmin={isAdmin}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        ) : (
          <AIDraftTool skills={skills} isAdmin={isAdmin} aiConfigured={aiConfigured} />
        )}
      </section>

      <DrillList drills={drills} skills={skills} onEdit={startEdit} editingId={editing?.id} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-white/10 text-bone" : "text-bone/50 hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}

// Skills relevant to a sport = global skills (sport null) + that sport's own.
function skillsForSport(skills: Skill[], sport: Sport): Skill[] {
  return skills.filter((s) => s.sport === null || s.sport === sport);
}

function DrillForm({
  skills,
  isAdmin,
  editing,
  onDone,
}: {
  skills: Skill[];
  isAdmin: boolean;
  editing: EditableDrill | null;
  onDone: () => void;
}) {
  const action = editing ? updateDrill : createDrill;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [sport, setSport] = useState<Sport>(editing?.sport ?? "rugby_league");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(editing?.skillIds ?? []),
  );

  // After a successful CREATE, clear the form so you can add another. After a
  // successful EDIT, drop back out of edit mode.
  useEffect(() => {
    if (!state?.success) return;
    if (editing) {
      onDone();
    } else {
      formRef.current?.reset();
      // Clear the controlled skill pills once the server action reports success —
      // a deliberate post-action reset, not a render-time cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(new Set());
    }
  }, [state?.success, editing, onDone]);

  const available = useMemo(() => skillsForSport(skills, sport), [skills, sport]);

  function toggleSkill(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // When sport changes, drop any selected skills that no longer apply.
  function onSportChange(next: Sport) {
    setSport(next);
    const valid = new Set(skillsForSport(skills, next).map((s) => s.id));
    setSelected((prev) => new Set([...prev].filter((id) => valid.has(id))));
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {editing && <input type="hidden" name="drillId" value={editing.id} />}
      {/* Selected skill ids ride along so the action's getAll("skillIds") works. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="skillIds" value={id} />
      ))}

      {state?.message && (
        <p className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">
          {state.message}
        </p>
      )}
      {state?.success && (
        <p className="rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal">
          {state.success}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={LABEL}>
          Drill title
        </label>
        <input
          id="title"
          name="title"
          className={FIELD}
          placeholder="Receive and Turn"
          autoComplete="off"
          defaultValue={editing?.title ?? ""}
        />
        {state?.errors?.title?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={LABEL}>
          How to run it
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className={FIELD}
          placeholder="Check to a feeder, take a half-turn first touch out of your feet, and play forward. Both directions, head up."
          defaultValue={editing?.description ?? ""}
        />
        {state?.errors?.description?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="sport" className={LABEL}>
            Sport
          </label>
          <select
            id="sport"
            name="sport"
            value={sport}
            onChange={(e) => onSportChange(e.target.value as Sport)}
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
          <label htmlFor="ageGroup" className={LABEL}>
            Age group
          </label>
          <select
            id="ageGroup"
            name="ageGroup"
            defaultValue={editing?.age_group ?? "u13"}
            className={FIELD}
          >
            {AGES.map((g) => (
              <option key={g} value={g}>
                {AGE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="durationMin" className={LABEL}>
            Minutes <span className="text-steel">(= XP)</span>
          </label>
          <input
            id="durationMin"
            name="durationMin"
            type="number"
            min={1}
            max={180}
            className={FIELD}
            placeholder="15"
            defaultValue={editing?.duration_min ?? ""}
          />
          {state?.errors?.durationMin?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="videoUrl" className={LABEL}>
            Video link <span className="text-steel">(optional)</span>
          </label>
          <input
            id="videoUrl"
            name="videoUrl"
            type="url"
            className={FIELD}
            placeholder="https://…"
            autoComplete="off"
            defaultValue={editing?.video_url ?? ""}
          />
          {state?.errors?.videoUrl?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="difficulty" className={LABEL}>
            Difficulty <span className="text-steel">(optional)</span>
          </label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={editing?.difficulty ? String(editing.difficulty) : ""}
            className={FIELD}
          >
            <option value="">Not set</option>
            <option value="1">1 · Intro</option>
            <option value="2">2 · Building</option>
            <option value="3">3 · Advanced</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>
          Skills <span className="text-steel">(tap to tag)</span>
        </span>
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
      </div>

      {/* Visibility — admins can publish global (platform-wide) content; everyone
          else writes to their own club. Hidden on edit (visibility is fixed). */}
      {isAdmin && !editing && (
        <div className="flex flex-col gap-1">
          <label htmlFor="scope" className={LABEL}>
            Visibility
          </label>
          <select id="scope" name="scope" defaultValue="global" className={FIELD}>
            <option value="global">Global — every club sees it</option>
            <option value="club">This club only</option>
          </select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending
            ? editing
              ? "Saving…"
              : "Adding…"
            : editing
              ? "Save changes"
              : "Add to library"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-semibold text-bone/60 hover:text-bone"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function DrillList({
  drills,
  skills,
  onEdit,
  editingId,
}: {
  drills: EditableDrill[];
  skills: Skill[];
  onEdit: (drill: EditableDrill) => void;
  editingId?: string;
}) {
  const skillLabel = useMemo(
    () => new Map(skills.map((s) => [s.id, s.label])),
    [skills],
  );

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-steel">
        {drills.length} {drills.length === 1 ? "drill you can edit" : "drills you can edit"}
      </h2>
      {drills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          Nothing yet — write your first drill above, or let the AI draft a few.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {drills.map((d) => (
            <li
              key={d.id}
              className={`flex flex-col gap-2 rounded-xl border bg-white/[0.03] p-4 ${
                editingId === d.id ? "border-signal/50" : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-bone">{d.title}</div>
                <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-xs text-steel">
                  {d.club_id === null ? "Global" : "Club"}
                </span>
              </div>
              <div className="text-xs text-steel">
                {SPORT_LABELS[d.sport]} · {AGE_GROUP_LABELS[d.age_group]} ·{" "}
                <span className="text-signal">+{d.duration_min} XP</span>
                {d.difficulty ? ` · L${d.difficulty}` : ""}
              </div>
              {d.skillIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {d.skillIds.map((id) => (
                    <span
                      key={id}
                      className="rounded-full border border-steel/40 bg-steel/10 px-2 py-0.5 text-xs text-steel"
                    >
                      {skillLabel.get(id) ?? "skill"}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => onEdit(d)}
                className="mt-1 self-start rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-bone/80 transition-colors hover:border-signal/50 hover:text-signal"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
