import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import { TrackView } from "@/components/track-view";
import {
  PAID_TIERS,
  TIER_LABELS,
  TIER_PRICE_LABELS,
  type Subscription,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "@/lib/types";
import { startCheckout, openBillingPortal } from "./actions";

export const metadata: Metadata = {
  title: "Membership · COLT",
};

// What each paid tier unlocks (BRAND voice — parent-facing: proof of value).
const TIER_PERKS: Record<Exclude<SubscriptionTier, "free">, string[]> = {
  tier1: [
    "A tailored expert program + weekly drops",
    "Full personal Ladder progression + challenges",
    "The deeper, position-specific drill library",
    "See every session, badge and tier-up",
  ],
  tier2: [
    "Everything in Tier 1",
    "Verified benchmark testing on video",
    "Coach feedback + video review",
    "A development profile with peer percentiles",
  ],
};

const LIVE: SubscriptionStatus[] = ["trialing", "active", "past_due"];

// Status banner copy keyed off the ?status= we redirect back with.
const STATUS_MESSAGES: Record<string, { tone: "good" | "bad"; text: string }> = {
  success: { tone: "good", text: "You're in. Welcome to the next level — time to sharpen up. 💪" },
  cancelled: { tone: "bad", text: "No worries — checkout cancelled. Come back when you're ready." },
  already_subscribed: { tone: "bad", text: "That athlete's already on a plan. Use Manage billing to change it." },
  unavailable: { tone: "bad", text: "Payments aren't switched on yet. Hang tight." },
  price_missing: { tone: "bad", text: "That plan isn't set up yet. Try again soon." },
  no_customer: { tone: "bad", text: "No billing account yet — start a plan first." },
  forbidden: { tone: "bad", text: "You can only manage plans for your own athletes." },
  error: { tone: "bad", text: "Something went sideways. Catch your breath and try again." },
};

function statusPill(status: SubscriptionStatus): string {
  const live = LIVE.includes(status);
  return [
    "rounded-full border px-2 py-0.5 text-xs",
    live ? "border-signal/40 bg-signal/10 text-signal" : "border-white/15 text-steel",
  ].join(" ");
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const current = await getCurrentUser();
  if (!current) return null;

  const sp = await searchParams;
  const statusKey = typeof sp.status === "string" ? sp.status : undefined;
  const banner = statusKey ? STATUS_MESSAGES[statusKey] : undefined;

  const supabase = await createClient();

  // Athletes this user pays for: the ones they manage, or themselves (linked).
  const { data: athleteRows } = await supabase
    .from("athletes")
    .select("id, full_name")
    .or(`parent_id.eq.${current.id},profile_id.eq.${current.id}`)
    .order("full_name");
  const athletes = athleteRows ?? [];

  // Their subscriptions (RLS lets the payer/athlete read these).
  const subsByAthlete = new Map<string, Subscription>();
  if (athletes.length > 0) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*")
      .in(
        "athlete_id",
        athletes.map((a) => a.id),
      );
    for (const s of (subs ?? []) as Subscription[]) {
      const existing = subsByAthlete.get(s.athlete_id);
      // Prefer a live row over a stale canceled one.
      if (!existing || (LIVE.includes(s.status) && !LIVE.includes(existing.status))) {
        subsByAthlete.set(s.athlete_id, s);
      }
    }
  }

  const configured = isStripeConfigured();
  const hasCustomer = [...subsByAthlete.values()].some((s) => s.stripe_customer_id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <TrackView feature="billing" />

      <section>
        <h1 className="font-display text-3xl text-bone">Membership</h1>
        <p className="mt-1 text-bone/60">
          Unlock the individual training edge for your athlete. The squad stays
          free — this is the personalised layer on top.
        </p>
        <div className="climb-divider mt-4" />
      </section>

      {banner && (
        <div
          className={[
            "rounded-xl border p-4 text-sm",
            banner.tone === "good"
              ? "border-signal/40 bg-signal/10 text-bone"
              : "border-white/15 bg-white/[0.03] text-bone/80",
          ].join(" ")}
        >
          {banner.text}
        </div>
      )}

      {!configured && (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-steel">
          Payments aren&apos;t switched on yet — set the Stripe keys in the
          environment and these plans go live. Everything below is the real flow.
        </div>
      )}

      {athletes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          Membership is managed by parents and players. Add an athlete first, then
          choose a plan for them.
        </p>
      ) : (
        <section className="flex flex-col gap-6">
          {athletes.map((a) => {
            const sub = subsByAthlete.get(a.id);
            const live = sub && LIVE.includes(sub.status);
            return (
              <div
                key={a.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-display text-xl text-bone">{a.full_name}</div>
                  {sub ? (
                    <span className={statusPill(sub.status)}>
                      {live ? TIER_LABELS[sub.tier].split(" — ")[0] : "Free"}
                      {sub.status !== "active" && live ? ` · ${sub.status}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-steel">
                      Free
                    </span>
                  )}
                </div>

                {live && sub?.cancel_at_period_end && (
                  <p className="mt-1 text-xs text-steel">
                    Cancels at the end of the current period.
                  </p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {PAID_TIERS.map((tier) => {
                    const isCurrent = live && sub?.tier === tier;
                    return (
                      <div
                        key={tier}
                        className="flex flex-col rounded-xl border border-white/10 p-4"
                      >
                        <div className="flex items-baseline justify-between">
                          <div className="font-semibold text-bone">
                            {TIER_LABELS[tier].split(" — ")[1] ?? TIER_LABELS[tier]}
                          </div>
                          <div className="text-sm text-steel">
                            {TIER_PRICE_LABELS[tier]}
                          </div>
                        </div>
                        <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-sm text-bone/70">
                          {TIER_PERKS[tier].map((perk) => (
                            <li key={perk} className="flex gap-2">
                              <span className="text-signal">›</span>
                              <span>{perk}</span>
                            </li>
                          ))}
                        </ul>
                        <form action={startCheckout} className="mt-4">
                          <input type="hidden" name="athleteId" value={a.id} />
                          <input type="hidden" name="tier" value={tier} />
                          <button
                            type="submit"
                            disabled={isCurrent}
                            className={[
                              "w-full rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                              isCurrent
                                ? "cursor-default border border-white/15 text-steel"
                                : tier === "tier1"
                                  ? "bg-signal text-ink hover:bg-signal/90"
                                  : "border border-white/20 text-bone hover:bg-white/5",
                            ].join(" ")}
                          >
                            {isCurrent
                              ? "Current plan"
                              : live
                                ? `Switch to ${TIER_PRICE_LABELS[tier]}`
                                : `Start ${TIER_PRICE_LABELS[tier]}`}
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {hasCustomer && (
        <form action={openBillingPortal}>
          <button
            type="submit"
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-bone/80 transition-colors hover:bg-white/5"
          >
            Manage billing
          </button>
        </form>
      )}

      <p className="text-xs text-steel">
        70% supports COLT; 30% goes back to your club for putting their players on
        the app. Cancel anytime.
      </p>
    </div>
  );
}
