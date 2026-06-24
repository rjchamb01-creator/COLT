"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recommendProgram, type RecommendResult } from "./actions";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";

// Goal → personalised program. The adult types a goal for the athlete; Claude
// sequences vetted library drills into a plan. Used both to build the first
// program and to rebuild a fresh one.
export function GoalForm({
  athleteId,
  aiConfigured,
  hasProgram,
}: {
  athleteId: string;
  aiConfigured: boolean;
  hasProgram: boolean;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onBuild() {
    setResult(null);
    startTransition(async () => {
      const res = await recommendProgram(athleteId, goal);
      setResult(res);
      if (res.ok) {
        setGoal("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={`goal-${athleteId}`}
        className="text-sm font-medium text-bone/80"
      >
        {hasProgram ? "Switch the focus" : "What should they work on?"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`goal-${athleteId}`}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className={FIELD}
          placeholder="Improve acceleration off the mark"
          autoComplete="off"
          maxLength={200}
          disabled={pending}
        />
        <button
          type="button"
          onClick={onBuild}
          disabled={pending || goal.trim().length < 3}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-signal px-5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
        >
          {pending
            ? "Building…"
            : hasProgram
              ? "Rebuild program"
              : "Build my program"}
        </button>
      </div>

      {!aiConfigured && (
        <p className="text-xs text-steel">
          The program builder isn&apos;t switched on yet — add a real
          ANTHROPIC_API_KEY and it&apos;ll start building plans.
        </p>
      )}

      {result && !result.ok && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            result.reason === "locked"
              ? "border-signal/40 bg-signal/10 text-bone"
              : "border-white/15 bg-white/[0.03] text-bone/80"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
