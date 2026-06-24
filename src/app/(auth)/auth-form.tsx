"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "./actions";
import type { AuthFormState } from "@/lib/validation";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const ERR = "text-xs text-signal";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {state?.message && (
        <p className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">
          {state.message}
        </p>
      )}

      {mode === "signup" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="fullName" className="text-sm font-medium text-bone/80">
            Full name
          </label>
          <input id="fullName" name="fullName" className={FIELD} autoComplete="name" />
          {state?.errors?.fullName?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-bone/80">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className={FIELD}
          autoComplete="email"
        />
        {state?.errors?.email?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
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
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {state?.errors?.password?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-signal px-5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
      >
        {pending
          ? "Please wait…"
          : mode === "login"
            ? "Log in"
            : "Create account"}
      </button>

      <p className="text-center text-sm text-bone/60">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-signal hover:underline">
              Start climbing
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-signal hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
