import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { isCoachConfigured } from "@/lib/anthropic";
import { TrackView } from "@/components/track-view";
import { CoachChat } from "./coach-chat";

export const metadata: Metadata = { title: "AI Coach · COLT" };

// The AI Coach — free in Phase 1, open to every role. The chat itself is a
// client component streaming from the server-side /api/coach route.
export default async function CoachPage() {
  const current = await getCurrentUser();
  // Layout already guards this, but narrow the type for TS.
  if (!current) return null;

  const configured = isCoachConfigured();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <TrackView feature="coach" />
      <section>
        <h1 className="font-display text-3xl text-bone">AI Coach</h1>
        <p className="mt-1 text-bone/60">
          Your training assistant — drills, motivation, and a plan to sharpen up.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {!configured && (
        <p className="rounded-xl border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          Coach isn&apos;t switched on yet — add a real{" "}
          <code className="font-mono">ANTHROPIC_API_KEY</code> to{" "}
          <code className="font-mono">.env.local</code> and restart the dev
          server to start training.
        </p>
      )}

      <CoachChat />
    </div>
  );
}
