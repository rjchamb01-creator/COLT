# COLT — Test-Mode Launch Guide

Get COLT live so your kids can start testing, **without Stripe payments and without
the Tier‑2 benchmark engine**. The free product (Training, XP/Ladder/Caps/Heat, the
Matchday Set, Squad, Coach) plus the **Tier‑1 AI Program Recommender** ("Weekly
Programs") will all work.

There's no outstanding code to write — this is pure setup. Four things: apply the
database, set an Anthropic key, deploy (or run locally), grant test access.

---

## What you're turning on

| Feature | Works in test mode | Needs |
|---|---|---|
| Auth, clubs, athletes, player (13+) accounts | ✅ already live | — |
| Training Library, XP/Tiers/Ladder/Caps/Heat | ✅ already live | — |
| Matchday Set, Squad Hub | ✅ already live | — |
| AI Coach | ✅ | `ANTHROPIC_API_KEY` |
| **AI Program Recommender (Weekly Programs)** | ✅ | DB script + `ANTHROPIC_API_KEY` + test entitlement |
| Stripe payments / billing checkout | ⏸️ off (degrades gracefully) | not needed for testing |
| Tier‑2 benchmark/verification engine | ❌ not built | out of scope |

Your live DB already has migrations 0010–0015. This launch only adds **0016**
(entitlement seam) and **0017** (the recommender).

---

## Step 1 — Apply the database (once)

1. Open the [Supabase dashboard](https://supabase.com/dashboard) → your COLT project
   → **SQL Editor** → **New query**.
2. Paste the **entire** contents of [`launch/test-launch.sql`](./test-launch.sql)
   and click **Run**.

That runs 0016 → 0017 → a test-mode entitlement seed (grants every athlete a live
Tier 1 so Weekly Programs unlock — no Stripe). Run it **once**, top to bottom; the
order matters (0017 depends on 0016).

> Adding a new kid later? Re-run just **Part C** (the entitlement seed) — it's
> idempotent and skips athletes who already have a plan.

---

## Step 2 — Get an Anthropic API key

The recommender (and Coach) call Claude server-side. Without a real key they show a
friendly "isn't switched on yet" message instead of erroring — so the key is what
makes Weekly Programs actually generate.

1. Go to **https://console.anthropic.com** → **Settings → API Keys → Create Key**.
2. Copy the `sk-ant-…` value (you only see it once).
3. Add a little credit under **Billing** — usage here is tiny. The recommender uses
   `claude-sonnet-4-6` and the Coach uses `claude-haiku-4-5`; a few cents covers a lot
   of testing.

You'll set this as the `ANTHROPIC_API_KEY` env var in Step 3/4. **Server-side only —
never put it in a `NEXT_PUBLIC_*` variable.**

---

## Step 3 — Deploy to Vercel

> In a hurry? See **"Run locally instead"** at the bottom — same env vars, no deploy.

1. **Push the repo to GitHub** (if it isn't already): create a repo and push your
   current branch.
2. **Import into Vercel:** [vercel.com/new](https://vercel.com/new) → import the repo.
   It auto-detects Next.js — no build settings to change.
3. **Set Environment Variables** (Project → Settings → Environment Variables) for the
   Production (and Preview) environment:

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-ref>.supabase.co` | Supabase → Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon/publishable key | Supabase → Settings → API |
   | `ANTHROPIC_API_KEY` | `sk-ant-…` | from Step 2 |
   | `NEXT_PUBLIC_APP_URL` | your Vercel URL (e.g. `https://colt-xyz.vercel.app`) | recommended |

   You can **skip** all the `STRIPE_*` and `SUPABASE_SERVICE_ROLE_KEY` variables —
   they're only used by the payments webhook, which is off in test mode.
4. **Deploy.** Note the resulting URL (e.g. `https://colt-xyz.vercel.app`).

### Point Supabase auth at your URL
In Supabase → **Authentication → URL Configuration**:
- Set **Site URL** to your Vercel URL.
- Add your Vercel URL (and `…/**`) to **Redirect URLs**.

This makes login + the 13+ claim links work on the deployed site.

### Email confirmation (for kid signups)
In Supabase → **Authentication → Providers → Email**, keep **Confirm email** in the
mode you want. The 13+ "claim your player account" flow assumes **auto-confirm is ON**
(the account links immediately on signup). If you turn confirmation on, the claim step
needs a post-confirm follow-up — easiest for testing is to leave auto-confirm on.

---

## Step 4 — Smoke test

On the deployed URL:

1. **Sign up** → create a club (you become Club Admin), or join one with a code.
2. **Add an athlete** (your kid) under **Athletes**.
3. *(If you added the athlete after running the SQL)* re-run **Part C** of
   `test-launch.sql` so the new athlete is entitled.
4. Open **Programs** in the nav → pick the athlete → type a goal
   (e.g. *"improve acceleration"*) → **Build my program**.
5. You should get a Claude-sequenced plan of real library drills. **Log session** on a
   drill → watch XP/Heat update and the progress bar fill.
6. *(Optional)* Invite the kid's own 13+ login from **Athletes → Invite player**, and
   have them do it from their account.

If Programs shows *"isn't switched on yet"* → `ANTHROPIC_API_KEY` isn't set/real.
If it shows the **upsell** instead of the goal box → that athlete isn't entitled yet
(run Part C).

---

## When you're ready for real payments

Replace the test entitlement with real Stripe:
1. Run the revoke line at the bottom of `test-launch.sql`
   (`delete from public.subscriptions where stripe_subscription_id is null;`).
2. Create the two Stripe Prices, set the `STRIPE_*` + `SUPABASE_SERVICE_ROLE_KEY` env
   vars, and point a Stripe webhook at `/api/stripe/webhook`. The billing page and
   checkout are already built and will light up automatically.

---

## Run locally instead (fastest for a quick try)

```bash
# .env.local already has your Supabase URL + anon key. Add your real key:
#   ANTHROPIC_API_KEY=sk-ant-...
npm install
npm run dev        # http://localhost:3000
```

You still do **Step 1** (apply the SQL) and **Step 2** (the key) — only the deploy
part is skipped. To let kids on your network in, run
`npm run dev -- -H 0.0.0.0` and share your machine's LAN IP (e.g. `http://192.168.x.x:3000`).
