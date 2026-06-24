"use client";

import { useActionState } from "react";
import { createClub, joinClub } from "./actions";
import type { AuthFormState } from "@/lib/validation";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const ERR = "text-xs text-signal";
const BTN =
  "mt-1 inline-flex h-11 items-center justify-center rounded-full bg-signal px-5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100";

function Message({ state }: { state: AuthFormState }) {
  if (!state?.message) return null;
  return (
    <p className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">
      {state.message}
    </p>
  );
}

export function OnboardingForms() {
  const [createState, createAction, creating] = useActionState<AuthFormState, FormData>(
    createClub,
    undefined,
  );
  const [joinState, joinAction, joining] = useActionState<AuthFormState, FormData>(
    joinClub,
    undefined,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-display text-lg text-bone">Create a club</h2>
        <p className="mt-1 mb-4 text-sm text-bone/60">
          Set up your club and invite coaches and parents. You’ll be its admin.
        </p>
        <form action={createAction} className="flex flex-col gap-3">
          <Message state={createState} />
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Club name
            </label>
            <input id="name" name="name" className={FIELD} placeholder="Eastside RLFC" />
            {createState?.errors?.name?.map((e) => (
              <p key={e} className={ERR}>
                {e}
              </p>
            ))}
          </div>
          <button type="submit" disabled={creating} className={BTN}>
            {creating ? "Creating…" : "Create club"}
          </button>
        </form>
      </section>

      <section className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-display text-lg text-bone">Join a club</h2>
        <p className="mt-1 mb-4 text-sm text-bone/60">
          Enter the share code your club gave you.
        </p>
        <form action={joinAction} className="flex flex-col gap-3">
          <Message state={joinState} />
          <div className="flex flex-col gap-1">
            <label htmlFor="code" className="text-sm font-medium">
              Share code
            </label>
            <input
              id="code"
              name="code"
              className={`${FIELD} uppercase tracking-widest`}
              placeholder="ABC123"
              autoCapitalize="characters"
            />
            {joinState?.errors?.code?.map((e) => (
              <p key={e} className={ERR}>
                {e}
              </p>
            ))}
          </div>
          <button type="submit" disabled={joining} className={BTN}>
            {joining ? "Joining…" : "Join club"}
          </button>
        </form>
      </section>
    </div>
  );
}
