import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password · COLT" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-2xl text-bone">Forgot your password?</h1>
      <p className="mb-6 text-sm text-bone/60">
        Drop your email and we&apos;ll send a link to set a new one.
      </p>
      <ForgotForm />
    </>
  );
}
