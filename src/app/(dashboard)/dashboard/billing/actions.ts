"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  getStripe,
  isStripeConfigured,
  priceIdForTier,
} from "@/lib/stripe";
import type { SubscriptionTier } from "@/lib/types";

// Build an absolute origin for Stripe's success/cancel URLs. Prefer the explicit
// app URL; otherwise reconstruct it from the forwarded request headers.
async function appOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function backTo(status: string): never {
  redirect(`/dashboard/billing?status=${status}`);
}

// Start a Stripe Checkout for a paid tier on a specific athlete. The payer is the
// current user (a parent or the athlete on their own account); conversion is
// per-athlete, so the athlete is the subscription's subject and its club is the
// 70/30 attribution target. Redirects to Stripe on success, or back with a
// status banner otherwise.
export async function startCheckout(formData: FormData): Promise<void> {
  const athleteId = String(formData.get("athleteId") ?? "");
  const tierRaw = String(formData.get("tier") ?? "");
  const tier: SubscriptionTier | null =
    tierRaw === "tier1" || tierRaw === "tier2" ? tierRaw : null;
  if (!athleteId || !tier) backTo("error");

  const current = await getCurrentUser();
  if (!current?.id) redirect("/login");

  // Authorise: the caller must manage this athlete (its parent) or BE the
  // athlete (linked player account). RLS scopes reads to the club, so this is
  // the meaningful ownership check.
  const supabase = await createClient();
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, club_id, full_name, parent_id, profile_id")
    .eq("id", athleteId)
    .maybeSingle();
  if (!athlete) backTo("error");
  if (athlete.parent_id !== current.id && athlete.profile_id !== current.id) {
    backTo("forbidden");
  }

  if (!isStripeConfigured()) backTo("unavailable");
  const price = priceIdForTier(tier);
  if (!price) backTo("price_missing");

  // Already subscribed at a live tier? Don't open a second Checkout — send them
  // to the portal to change plan instead.
  const { data: live } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("athlete_id", athleteId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();
  if (live) backTo("already_subscribed");

  const origin = await appOrigin();
  const metadata = {
    athlete_id: athlete.id,
    club_id: athlete.club_id,
    payer_id: current.id,
    tier,
  };

  let url: string | null = null;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: current.email ?? undefined,
      client_reference_id: athlete.id,
      allow_promotion_codes: true,
      // Stamp attribution on the subscription so every later subscription/invoice
      // event can be attributed without a lookup (and survives in the invoice's
      // metadata snapshot for the 70/30 ledger).
      subscription_data: { metadata },
      metadata,
      success_url: `${origin}/dashboard/billing?status=success`,
      cancel_url: `${origin}/dashboard/billing?status=cancelled`,
    });
    url = session.url;
  } catch {
    backTo("error");
  }

  await logActivity("billing", "checkout_started", {
    athlete_id: athlete.id,
    tier,
  });
  if (!url) backTo("error");
  redirect(url);
}

// Open the Stripe billing portal so a payer can change plan, update card, or
// cancel. Cancellation flows back through the webhook to flip entitlement off.
export async function openBillingPortal(): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.id) redirect("/login");
  if (!isStripeConfigured()) backTo("unavailable");

  const supabase = await createClient();
  // Any subscription this payer owns with a Stripe customer id will do.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("payer_id", current.id)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.stripe_customer_id) backTo("no_customer");

  const origin = await appOrigin();
  let url: string | null = null;
  try {
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/dashboard/billing`,
    });
    url = portal.url;
  } catch {
    backTo("error");
  }
  if (!url) backTo("error");
  redirect(url);
}
