import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Log in · COLT" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-2xl text-bone">Welcome back</h1>
      <p className="mb-6 text-sm text-bone/60">Pick up where you left off.</p>
      <AuthForm mode="login" />
    </>
  );
}
