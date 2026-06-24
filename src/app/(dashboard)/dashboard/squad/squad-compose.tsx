"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  SPORTS,
  type AgeGroup,
} from "@/lib/types";
import type { AuthFormState } from "@/lib/validation";
import { createAnnouncement, createEvent } from "./actions";

const FIELD =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal";
const ERR = "text-xs text-signal";
const LABEL = "text-sm font-medium text-bone/80";
const PRIMARY =
  "mt-1 inline-flex h-11 items-center justify-center self-start rounded-full bg-signal px-6 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100";

const AGES: AgeGroup[] = ["u10", "u13", "u16"];

type Tab = "post" | "session";

// Coach / club_admin / admin compose UI for the Squad Hub. A tab toggle keeps a
// single primary (lime) action on screen at a time, per BRAND.md. RLS is the
// real gate — this just makes the write path easy for the people who own it.
export function SquadCompose() {
  const [tab, setTab] = useState<Tab>("post");

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-5 flex items-center gap-2">
        <TabButton active={tab === "post"} onClick={() => setTab("post")}>
          Post to the Squad
        </TabButton>
        <TabButton active={tab === "session"} onClick={() => setTab("session")}>
          Schedule a session
        </TabButton>
      </div>

      {tab === "post" ? <AnnouncementForm /> : <EventForm />}
    </section>
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
        active
          ? "bg-white/10 text-bone"
          : "text-bone/50 hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}

function FormStatus({ state }: { state: AuthFormState }) {
  return (
    <>
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
    </>
  );
}

function AnnouncementForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    createAnnouncement,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <FormStatus state={state} />

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={LABEL}>
          Title
        </label>
        <input
          id="title"
          name="title"
          className={FIELD}
          placeholder="Big game this weekend"
          autoComplete="off"
        />
        {state?.errors?.title?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="body" className={LABEL}>
          Message
        </label>
        <textarea
          id="body"
          name="body"
          rows={4}
          className={FIELD}
          placeholder="Be at Riverside Oval by 8:30. Bring your boots and your best."
        />
        {state?.errors?.body?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Posting…" : "Post to the Squad"}
      </button>
    </form>
  );
}

function EventForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    createEvent,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <FormStatus state={state} />

      <div className="flex flex-col gap-1">
        <label htmlFor="event-title" className={LABEL}>
          Session
        </label>
        <input
          id="event-title"
          name="title"
          className={FIELD}
          placeholder="Tuesday training"
          autoComplete="off"
        />
        {state?.errors?.title?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="startsAt" className={LABEL}>
            Date &amp; time
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            className={FIELD}
          />
          {state?.errors?.startsAt?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="location" className={LABEL}>
            Location
          </label>
          <input
            id="location"
            name="location"
            className={FIELD}
            placeholder="Riverside Oval"
            autoComplete="off"
          />
          {state?.errors?.location?.map((e) => (
            <p key={e} className={ERR}>
              {e}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={LABEL}>
          Details <span className="text-steel">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className={FIELD}
          placeholder="Focus on defence and footwork. Be there 10 minutes early."
        />
        {state?.errors?.description?.map((e) => (
          <p key={e} className={ERR}>
            {e}
          </p>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="event-sport" className={LABEL}>
            Sport <span className="text-steel">(optional)</span>
          </label>
          <select id="event-sport" name="sport" defaultValue="" className={FIELD}>
            <option value="">Whole Squad</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="event-age" className={LABEL}>
            Age group <span className="text-steel">(optional)</span>
          </label>
          <select id="event-age" name="ageGroup" defaultValue="" className={FIELD}>
            <option value="">All ages</option>
            {AGES.map((g) => (
              <option key={g} value={g}>
                {AGE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Scheduling…" : "Schedule session"}
      </button>
    </form>
  );
}
