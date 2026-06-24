"use client";

import { useState } from "react";
import { generateInvite } from "./actions";

// Per-athlete control on the Athletes page. Shows a "linked" badge once the
// athlete has claimed their own login; otherwise lets a managing adult mint a
// single-use /claim link to hand to the (13+) athlete.
export function PlayerInvite({
  athleteId,
  linked,
}: {
  athleteId: string;
  linked: boolean;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (linked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-1 text-xs font-semibold text-signal">
        Player linked ✓
      </span>
    );
  }

  async function onGenerate() {
    setPending(true);
    setError(null);
    const res = await generateInvite(athleteId);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLink(`${window.location.origin}/claim?token=${res.token}`);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {!link ? (
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending}
          className="self-start rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-bone/80 transition-colors hover:border-signal/50 hover:text-signal disabled:opacity-50"
        >
          {pending ? "Generating…" : "Invite player (13+)"}
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-white/15 bg-ink px-2.5 py-1.5 text-xs text-bone/80 outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg bg-signal px-3 text-xs font-bold uppercase tracking-wide text-ink"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-steel">
            Send this to the athlete. Works once, for ages 13+.
          </p>
        </>
      )}
      {error && <p className="text-xs text-signal">{error}</p>}
    </div>
  );
}
