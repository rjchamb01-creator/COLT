"use client";

import { useState, useTransition } from "react";
import { TIER_LABELS } from "@/lib/gamification";
import { logSession, type LogSessionResult } from "./actions";

type AthleteOption = { id: string; full_name: string };

export function LogSession({
  drillId,
  athletes,
}: {
  drillId: string;
  athletes: AthleteOption[];
}) {
  const [athleteId, setAthleteId] = useState(athletes[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LogSessionResult | null>(null);

  if (athletes.length === 0) {
    return (
      <p className="mt-3 text-xs text-steel">
        Add an athlete to start banking XP.
      </p>
    );
  }

  function onLog() {
    startTransition(async () => {
      setResult(await logSession(athleteId, drillId));
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {athletes.length > 1 && (
          <select
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-ink px-2 py-1.5 text-xs text-bone outline-none focus:border-signal"
            aria-label="Athlete"
          >
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onLog}
          disabled={pending}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-signal px-4 text-xs font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100"
        >
          {pending ? "Logging…" : "Log session"}
        </button>
      </div>

      {result?.ok === false && (
        <p className="text-xs text-signal">{result.error}</p>
      )}

      {result?.ok && (
        <div className="rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-xs">
          <span className="font-display text-sm text-signal">
            +{result.result.xp_gained} XP
          </span>
          {result.result.tier_changed && (
            <span className="ml-2 font-semibold text-signal">
              Level up! {TIER_LABELS[result.result.tier]} tier 🚀
            </span>
          )}
          {result.result.heat >= 2 && (
            <span className="ml-2 text-signal">
              🔥 {result.result.heat}-day Heat
            </span>
          )}
          {result.result.new_caps.length > 0 && (
            <div className="mt-1 text-bone/80">
              New badge{result.result.new_caps.length > 1 ? "s" : ""}:{" "}
              {result.result.new_caps.map((c) => `${c.icon} ${c.name}`).join(" · ")}
            </div>
          )}
          {result.result.set_completed && (
            <div className="mt-1 font-semibold text-signal">
              🏆 Challenge complete — +{result.result.set_bonus_xp} bonus XP banked!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
