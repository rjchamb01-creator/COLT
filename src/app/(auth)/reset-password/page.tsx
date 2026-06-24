import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Set a new password · COLT" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-2xl text-bone">Set a new password</h1>
      <p className="mb-6 text-sm text-bone/60">
        Almost there — pick a new password and you&apos;re back in.
      </p>
      <ResetForm />
    </>
  );
}
