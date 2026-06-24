"use client";

import { useState, useTransition } from "react";
import { rotateSets } from "./actions";

// Admin-only control to build this week's global Sets on demand — for testing
// the weekly auto-rotation without waiting for the Monday pg_cron run. Idempotent
// on the DB side (cohorts that already have a live Set this week are skipped).
export function RotateNow() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function onRotate() {
    startTransition(async () => {
      const res = await rotateSets();
      if (res.ok) {
        setIsError(false);
        setMsg(
          res.created === 0
            ? "Every cohort already has a live Set this week — nothing to rotate."
            : `Fresh Set${res.created === 1 ? "" : "s"} live for ${res.created} cohort${
                res.created === 1 ? "" : "s"
              } this week.`,
        );
      } else {
        setIsError(true);
        setMsg(res.error);
      }
    });
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm">
        <div className="font-semibold text-bone">Weekly Set rotation</div>
        <div className="text-steel">
          Runs automatically every Monday. Trigger this week&apos;s Sets now to
          test it.
        </div>
        {msg && (
          <p className={`mt-1.5 text-xs ${isError ? "text-signal" : "text-signal"}`}>
            {msg}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRotate}
        disabled={pending}
        className="shrink-0 rounded-full border border-signal/40 px-4 py-2 text-sm font-semibold text-signal transition-colors hover:bg-signal/10 disabled:opacity-60"
      >
        {pending ? "Rotating…" : "Rotate now"}
      </button>
    </section>
  );
}
