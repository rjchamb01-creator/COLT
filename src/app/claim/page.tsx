import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/Logo";
import {
  AGE_GROUP_LABELS,
  SPORT_LABELS,
  type AthleteInvitePreview,
} from "@/lib/types";
import { ClaimSignupForm, ClaimExistingForm } from "./claim-ui";

export const metadata: Metadata = { title: "Join your Squad · COLT" };

// Public route (see proxy PUBLIC_PATHS): an athlete opens their invite link here
// before they have an account. We preview the record behind the token, then show
// either a signup-and-claim form (new athlete) or a claim button (already signed
// in). All the real gating lives in claim_athlete / peek_athlete_invite.
export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let preview: AthleteInvitePreview | null = null;
  if (token) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("peek_athlete_invite", { p_token: token });
    preview = (data as AthleteInvitePreview | null) ?? null;
  }

  const current = await getCurrentUser();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-xl shadow-black/30">
        <Link href="/" className="mb-6 block">
          <Logo className="h-9 w-auto text-bone" />
        </Link>

        {!token || !preview ? (
          <>
            <h1 className="mb-1 font-display text-2xl text-bone">
              Invite not found
            </h1>
            <p className="text-sm text-bone/60">
              This invite link is invalid or has already been used. Ask your coach
              or parent for a fresh one.
            </p>
          </>
        ) : (
          <>
            <div className="mb-5 rounded-xl border border-signal/25 bg-signal/[0.05] p-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-signal">
                Claim your player profile
              </div>
              <div className="mt-1 font-display text-xl text-bone">
                {preview.full_name}
              </div>
              <div className="text-sm text-bone/70">
                {SPORT_LABELS[preview.sport]} ·{" "}
                {AGE_GROUP_LABELS[preview.age_group]} · {preview.club_name}
              </div>
            </div>

            {current ? (
              <ClaimExistingForm token={token} email={current.email} />
            ) : (
              <ClaimSignupForm token={token} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
