import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign up · COLT" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-2xl text-bone">Be the Next One</h1>
      <p className="mb-6 text-sm text-bone/60">
        Create your account and start the climb.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}
