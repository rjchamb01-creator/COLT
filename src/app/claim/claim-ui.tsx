"use client";

import { useActionState } from "react";
import type { AuthFormState } from "@/lib/validation";
import { claimSignup, claimExisting } from "./actions";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const ERR = "text-xs text-signal";
const PRIMARY =
  "mt-2 inline-flex h-11 items-center justify-center rounded-full bg-signal px-5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100";

function Message({ state }: { state: AuthFormState }) {
  if (!state?.message) return null;
  return (
    <p className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">
      {state.message}
    </p>
  );
}

// New athlete: sign up + claim in one go.
export function ClaimSignupForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    claimSignup,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Message state={state} />
      <p className="text-sm text-bone/60">
        Set up your account and start logging your own training.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-sm font-medium text-bone/80">
          Your name
        </label>
        <input id="fullName" name="fullName" className={FIELD} autoComplete="name" />
        {state?.errors?.fullName?.map((e) => (
          <p key={e} className={ERR}>{e}</p>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-bone/80">
          Email
        </label>
        <input id="email" name="email" type="email" className={FIELD} autoComplete="email" />
        {state?.errors?.email?.map((e) => (
          <p key={e} className={ERR}>{e}</p>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-bone/80">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className={FIELD}
          autoComplete="new-password"
        />
        {state?.errors?.password?.map((e) => (
          <p key={e} className={ERR}>{e}</p>
        ))}
      </div>

      <label className="flex items-start gap-2 text-xs text-bone/70">
        <input type="checkbox" name="over13" className="mt-0.5 accent-signal" />
        <span>
          I&apos;m 13 or older. (Younger athletes train on a parent&apos;s account.)
        </span>
      </label>
      {state?.errors?.over13?.map((e) => (
        <p key={e} className={ERR}>{e}</p>
      ))}

      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Setting you up…" : "Create my player account"}
      </button>
    </form>
  );
}

// Already signed in → just link this account.
export function ClaimExistingForm({
  token,
  email,
}: {
  token: string;
  email?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    claimExisting,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Message state={state} />
      <p className="text-sm text-bone/70">
        You&apos;re signed in{email ? ` as ${email}` : ""}. Claiming links{" "}
        <strong className="text-bone">this account</strong> to the player
        profile above.
      </p>
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Claiming…" : "Claim this profile"}
      </button>
      <p className="text-center text-xs text-bone/50">
        Not you?{" "}
        <a href="/login" className="font-semibold text-signal hover:underline">
          use a different account
        </a>
      </p>
    </form>
  );
}
