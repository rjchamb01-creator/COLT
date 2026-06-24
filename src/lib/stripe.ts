// Stripe client for Payments (Phase 2). SERVER-ONLY — never import this into a
// client component; the secret key must never reach the browser. Mirrors the
// AI Coach's lib/anthropic.ts pattern: a configured() guard so the app builds and
// runs (showing a friendly "not switched on" state) before real keys are set.
import Stripe from "stripe";
import type { SubscriptionTier } from "@/lib/types";

// Pin to the API version this SDK build ships with, so upgrades are deliberate.
const API_VERSION = "2026-05-27.dahlia";

// The .env placeholders shipped in .env.example — treated as "unset".
const PLACEHOLDER = "your-stripe-secret-key";

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && key !== PLACEHOLDER;
}

let client: Stripe | null = null;

// Lazily construct a singleton. Throws if called without a real key — callers
// must gate on isStripeConfigured() first (same contract as getAnthropic()).
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === PLACEHOLDER) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!client) client = new Stripe(key, { apiVersion: API_VERSION });
  return client;
}

// The Stripe Price id backing each paid tier, read from env (set these to the
// recurring $9.99 / $19.99 prices created in the Stripe dashboard).
export function priceIdForTier(tier: Exclude<SubscriptionTier, "free">): string | undefined {
  return tier === "tier2"
    ? process.env.STRIPE_PRICE_TIER2
    : process.env.STRIPE_PRICE_TIER1;
}

// Reverse map: which tier a Stripe price id corresponds to (used by the webhook
// to record the right tier from the subscription's price). Returns null for an
// unknown price so the webhook can fail safe.
export function tierForPriceId(priceId: string | null | undefined): SubscriptionTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_TIER2) return "tier2";
  if (priceId === process.env.STRIPE_PRICE_TIER1) return "tier1";
  return null;
}

// The club's cut of each invoice, in basis points (30% → 3000). Kept here next to
// the billing logic; the webhook stamps the resolved split onto each ledger row.
export const CLUB_SHARE_BPS = 3000;
