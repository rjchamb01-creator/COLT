import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signout } from "../(auth)/actions";
import { OnboardingForms } from "./onboarding-forms";

export const metadata: Metadata = { title: "Set up your club · COLT" };

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  // Already onboarded — nothing to do here.
  if (current.profile?.club_id) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-bone">
              Get your squad set up
            </h1>
            <p className="mt-1 text-bone/60">
              Create your club or join an existing one — then the climb begins.
            </p>
          </div>
          <form action={signout}>
            <button
              type="submit"
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-bone/80 transition-colors hover:bg-white/5"
            >
              Sign out
            </button>
          </form>
        </div>
        <div className="climb-divider mb-6" />
        <OnboardingForms />
      </div>
    </div>
  );
}
