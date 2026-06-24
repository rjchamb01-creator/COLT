// Claude (Anthropic) client for the AI Coach. SERVER-ONLY — never import this
// into a client component; the API key must never reach the browser.
//
// Per CLAUDE.md the AI Coach is the *secondary* feature (not the moat) and ships
// FREE in Phase 1, so it runs on the cheapest/fastest tier: Claude Haiku 4.5.
import Anthropic from "@anthropic-ai/sdk";

// The model the coach runs on. Cheap + fast for a high-volume, free chatbot.
export const COACH_MODEL = "claude-haiku-4-5";

// The model the internal AI drill-DRAFT tool runs on. This is staff-only,
// low-volume, and quality matters (it drafts structured content a human then
// reviews before it ever reaches the youth library), so it runs on a more
// capable tier than the coach.
export const DRAFT_MODEL = "claude-sonnet-4-6";

// The .env placeholder shipped in .env.example / .env.local — treated as "unset"
// so the app runs and the route can return a friendly "not configured" message
// instead of erroring before a real key is added.
const PLACEHOLDER_KEY = "your-anthropic-api-key";

export function isCoachConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key !== PLACEHOLDER_KEY;
}

let client: Anthropic | null = null;

// Lazily construct a singleton client. Throws if called without a real key —
// callers should gate on isCoachConfigured() first.
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === PLACEHOLDER_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}
