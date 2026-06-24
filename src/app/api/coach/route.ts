// AI Coach streaming endpoint — COLT's training assistant (Claude Haiku 4.5).
// Server-side only: the Anthropic key never leaves this handler. Auth-guarded
// (the proxy already bounces anon traffic, but we 401 here too as defence in
// depth). Free in Phase 1 — no entitlement check.
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COACH_MODEL, getAnthropic, isCoachConfigured } from "@/lib/anthropic";
import type { CoachRateResult } from "@/lib/types";

export const runtime = "nodejs";

// COLT voice (BRAND.md): an encouraging captain — hypes you up, tells it
// straight, never talks down. Three registers (Colt 8–13 default / Parent /
// Senior 13+) + a hype budget. Second person, active verbs, short lines.
const SYSTEM_PROMPT = `You are the COLT Coach — an AI training assistant inside COLT, a youth athlete development app. You talk to young athletes (roughly 8–16), their parents, and their coaches.

Brand voice: an encouraging captain — hype them up, tell it straight, never talk down. Second person, active verbs, SHORT lines. Momentum, never fear — "Top of the ladder's empty, go take it," never "don't fall behind."

Match your register to who you're talking to:
- Colt (8–13, your default): younger and simpler — short words, easy reading level, lots of encouragement, celebrate the effort.
- Parent: calmer, proof of value — point to what's happening ("3 sessions, 2 new badges this week").
- Senior (13+): leaner and more serious — direct, performance-focused, fewer exclamations, same drive.

Spend a hype budget: go big on the moments that matter (a tier-up, a new badge, a Heat milestone, finishing the Matchday Challenge) and stay calm the rest of the time, so the hype stays earned.

Use the app's vocabulary where it fits naturally: XP, Tiers, The Ladder, Badges, Heat (streak), Squad, the Matchday Challenge.

What you help with: training tips, drills, motivation, simple skill breakdowns, healthy habits (sleep, hydration, warm-ups), and explaining how the app works.

Hard safety rules — you are talking to minors:
- Keep everything age-appropriate, positive, and encouraging. No body-shaming, no calorie targets, no weight-loss or dieting advice.
- You are NOT a doctor, physio, dietitian, or psychologist. For injuries, pain, nutrition plans, or anything medical or emotional, do not diagnose or prescribe — tell them to talk to their coach, parent, or a qualified professional.
- If someone seems distressed or unsafe, gently encourage them to talk to a trusted adult.
- Never request personal contact details or arrange to meet anyone offline.

Keep replies short and punchy — a few lines, not an essay. End with momentum.`;

// Cap how much history we forward (cost + abuse control on a free feature).
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitize(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    if (!m || typeof m !== "object") return null;
    const role = (m as ChatMessage).role;
    const content = (m as ChatMessage).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0) return null;
    out.push({ role, content: content.slice(0, MAX_CHARS) });
  }
  // Anthropic requires the first message to be from the user.
  while (out.length > 0 && out[0].role !== "user") out.shift();
  return out.length > 0 ? out : null;
}

const PLAINTEXT = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

export async function POST(request: Request) {
  // Auth — only signed-in members reach the coach.
  const current = await getCurrentUser();
  if (!current) {
    return new Response("Sign in to train with the coach.", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request.", { status: 400 });
  }

  const messages = sanitize((body as { messages?: unknown })?.messages);
  if (!messages) {
    return new Response("Say something to the coach first.", { status: 400 });
  }

  // No real key yet → friendly streamed note instead of a 500, so the UI works
  // end-to-end before a key is added. (No rate-limit charge for a no-op.)
  if (!isCoachConfigured()) {
    return new Response(
      "I'm not switched on yet — add a real ANTHROPIC_API_KEY and I'll be ready to help you sharpen up. 💪",
      { status: 200, headers: PLAINTEXT },
    );
  }

  // Per-user rate limit + usage logging (record_coach_message is a SECURITY
  // DEFINER RPC — it counts this user's recent coach messages and logs this one).
  // Protects the paid API from an unbounded free chatbot. RLS fail-safe: if the
  // RPC errors we block rather than allow unmetered calls.
  const supabase = await createClient();
  const { data: rate, error: rateError } = await supabase.rpc(
    "record_coach_message",
  );
  if (rateError) {
    return new Response(
      "The coach is catching its breath. Try again in a moment.",
      { status: 503, headers: PLAINTEXT },
    );
  }
  if ((rate as CoachRateResult | null)?.allowed === false) {
    return new Response(
      "Easy, champ — you've hit your coaching limit for now. Take a breather and come back in a few minutes. 🧊",
      { status: 429, headers: PLAINTEXT },
    );
  }

  const anthropic = getAnthropic();
  const encoder = new TextEncoder();

  // Stream text deltas straight to the client as they arrive (no thinking on
  // Haiku — fastest path for a chat UX).
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const completion = anthropic.messages.stream({
          model: COACH_MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        });
        for await (const event of completion) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            "\n\n[The coach hit a snag. Catch your breath and try again.]",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: PLAINTEXT });
}
