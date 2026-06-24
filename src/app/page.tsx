import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 py-24 text-center">
        <Logo className="h-10 w-auto text-bone" />

        <span className="rounded-full border border-signal/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-signal">
          Be the Next One
        </span>

        <h1 className="font-display text-5xl leading-[0.95] text-bone sm:text-7xl">
          Rise through
          <br />
          the grades
        </h1>

        <p className="max-w-md text-lg text-bone/70">
          Every session makes you better — and it feels like play. Climb the
          ladder, earn your caps, and watch your progress rise.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-full bg-signal px-7 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.03]"
          >
            Start climbing
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-7 text-sm font-semibold text-bone transition-colors hover:bg-white/5"
          >
            Log in
          </Link>
        </div>

        <div className="climb-divider mt-4 max-w-xs" />

        <ul className="mt-2 grid gap-4 text-sm text-bone/60 sm:grid-cols-3">
          <li>
            <span className="block font-display text-bone">Progress</span>
            you can see
          </li>
          <li>
            <span className="block font-display text-bone">Play</span>
            that earns rewards
          </li>
          <li>
            <span className="block font-display text-bone">Pride</span>
            in your squad
          </li>
        </ul>
      </main>
    </div>
  );
}
