// Stripe webhook — the ONE privileged write path for subscriptions + the 70/30
// revenue ledger. SERVER-ONLY, no user session: Stripe calls this directly, so
// the signature (STRIPE_WEBHOOK_SECRET) is the auth, and writes use the
// service-role client (bypasses RLS — there are no client RLS write policies on
// these tables). The route is in the proxy's PUBLIC_PATHS so it isn't bounced to
// /login. Must read the RAW body for signature verification.
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CLUB_SHARE_BPS,
  getStripe,
  isStripeConfigured,
  tierForPriceId,
} from "@/lib/stripe";
import type {
  SubscriptionStatus,
  SubscriptionTier,
} from "@/lib/types";

export const runtime = "nodejs";
// Never cache or prerender a webhook.
export const dynamic = "force-dynamic";

// Metadata we stamp on every Stripe subscription at checkout, so subscription and
// invoice events can be attributed without a round-trip.
type SubMeta = {
  athlete_id?: string;
  club_id?: string;
  payer_id?: string;
  tier?: string;
};

function isoFromUnix(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

// The price + period live on the subscription ITEM in the current API version.
function firstItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  return sub.items?.data?.[0];
}

// Resolve the tier from the priced item (source of truth), falling back to the
// tier stamped in metadata. Returns null if neither resolves to a known tier.
function resolveTier(sub: Stripe.Subscription): SubscriptionTier | null {
  const fromPrice = tierForPriceId(firstItem(sub)?.price?.id);
  if (fromPrice) return fromPrice;
  const meta = (sub.metadata ?? {}) as SubMeta;
  if (meta.tier === "tier1" || meta.tier === "tier2") return meta.tier;
  return null;
}

// Upsert our subscriptions row from a Stripe Subscription object. Keyed on
// stripe_subscription_id so created/updated/deleted all converge on one row.
async function upsertSubscription(sub: Stripe.Subscription): Promise<void> {
  const supabase = createServiceClient();
  const meta = (sub.metadata ?? {}) as SubMeta;
  const item = firstItem(sub);
  const tier = resolveTier(sub);

  const patch = {
    status: sub.status as SubscriptionStatus,
    stripe_customer_id:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_price_id: item?.price?.id ?? null,
    current_period_end: isoFromUnix(item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
    ...(tier ? { tier } : {}),
  };

  // When metadata carries the attribution keys, upsert the full row (handles the
  // first time we see this subscription). Without them we can only patch an
  // existing row — never invent attribution we can't trust.
  if (meta.athlete_id && meta.club_id && tier) {
    await supabase.from("subscriptions").upsert(
      {
        stripe_subscription_id: sub.id,
        athlete_id: meta.athlete_id,
        club_id: meta.club_id,
        payer_id: meta.payer_id ?? null,
        tier,
        ...patch,
      },
      { onConflict: "stripe_subscription_id" },
    );
    return;
  }

  await supabase
    .from("subscriptions")
    .update(patch)
    .eq("stripe_subscription_id", sub.id);
}

// Record a paid invoice into the 70/30 ledger (idempotent on stripe_invoice_id).
async function recordInvoice(invoice: Stripe.Invoice): Promise<void> {
  // Only subscription invoices with money actually collected are revenue.
  const amount = invoice.amount_paid ?? 0;
  if (amount <= 0) return;

  const details = invoice.parent?.subscription_details;
  if (!details) return; // not a subscription invoice
  const subId =
    typeof details.subscription === "string"
      ? details.subscription
      : details.subscription?.id ?? null;
  const meta = (details.metadata ?? {}) as SubMeta;

  const supabase = createServiceClient();

  // Find our subscription row (for the FK + as a fallback attribution source).
  let subRowId: string | null = null;
  let clubId = meta.club_id ?? null;
  let athleteId = meta.athlete_id ?? null;
  let payerId = meta.payer_id ?? null;
  let tier: SubscriptionTier | null =
    meta.tier === "tier1" || meta.tier === "tier2" ? meta.tier : null;

  if (subId) {
    const { data: row } = await supabase
      .from("subscriptions")
      .select("id, club_id, athlete_id, payer_id, tier")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();
    if (row) {
      subRowId = row.id;
      clubId ??= row.club_id;
      athleteId ??= row.athlete_id;
      payerId ??= row.payer_id;
      tier ??= row.tier;
    }
  }

  // Can't attribute the 30% without a club — skip rather than mis-record.
  if (!clubId || !tier) return;

  const clubShare = Math.round((amount * CLUB_SHARE_BPS) / 10000);
  const coltShare = amount - clubShare;

  await supabase.from("subscription_invoices").upsert(
    {
      subscription_id: subRowId,
      athlete_id: athleteId,
      club_id: clubId,
      payer_id: payerId,
      tier,
      stripe_invoice_id: invoice.id as string,
      amount_total: amount,
      currency: invoice.currency,
      club_share_bps: CLUB_SHARE_BPS,
      club_share: clubShare,
      colt_share: coltShare,
      period_start: isoFromUnix(invoice.period_start),
      period_end: isoFromUnix(invoice.period_end),
    },
    { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
  );
}

export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe is not configured.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature.", { status: 400 });
  }

  const stripe = getStripe();
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    // Bad signature / malformed payload — never process it.
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        // Pull the full subscription (with its priced item) so the row is
        // populated promptly, not only once the subscription.* event lands.
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid": {
        await recordInvoice(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch {
    // A handler failure is worth a Stripe retry (return 500). We don't leak the
    // error detail.
    return new Response("Webhook handler failed.", { status: 500 });
  }

  return Response.json({ received: true });
}
