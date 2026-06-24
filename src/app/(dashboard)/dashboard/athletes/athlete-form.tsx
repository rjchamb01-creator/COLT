"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  SPORTS,
  type AgeGroup,
} from "@/lib/types";
import type { AuthFormState } from "@/lib/validation";
import { createAthlete } from "./actions";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const ERR = "text-xs text-signal";

const AGES: AgeGroup[] = ["u10", "u13", "u16"];

export function AthleteForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    createAthlete,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful add so you can keep adding athletes.
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
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
        <label htmlFor="fullName" className="text-sm font-medium text-bone/80">
          Athlete name
        </label>
        <input
          id="fullName"
          name="fullName"
          className={FIELD}
          placeholder="Mia Thompson"
          autoComplete="off"
        />
        {state?.errors?.fullName?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="sport" className="text-sm font-medium text-bone/80">
            Sport
          </label>
          <select id="sport" name="sport" defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose a sport
            </option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </select>
          {state?.errors?.sport?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ageGroup" className="text-sm font-medium text-bone/80">
            Age group
          </label>
          <select id="ageGroup" name="ageGroup" defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose an age group
            </option>
            {AGES.map((g) => (
              <option key={g} value={g}>
                {AGE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
          {state?.errors?.ageGroup?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex h-11 items-center justify-center self-start rounded-full bg-signal px-6 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
      >
        {pending ? "Adding…" : "Add athlete"}
      </button>
    </form>
  );
}
