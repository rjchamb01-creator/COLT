import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";
import { navLinks } from "@/lib/nav";
import { Logo } from "@/components/brand/Logo";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { signout } from "../(auth)/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  // No club yet → finish onboarding before entering the app.
  if (!current.profile?.club_id) redirect("/onboarding");

  const role = current.profile?.role ?? "parent";
  const name = current.profile?.full_name ?? current.email ?? "Member";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/dashboard">
            <Logo className="h-7 w-auto text-bone" />
          </Link>
          {/* Desktop nav — the mobile bottom tab bar takes over below md. */}
          <nav className="hidden items-center gap-5 text-sm font-medium text-bone/60 md:flex">
            {navLinks(role).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-bone"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="font-medium text-bone">{name}</div>
            <div className="text-xs text-steel">
              {ROLE_LABELS[role]}
              {current.club ? ` · ${current.club.name}` : ""}
            </div>
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
      </header>
      {/* Extra bottom padding on mobile so content clears the fixed tab bar. */}
      <main className="flex-1 px-4 py-8 pb-28 sm:px-6 md:pb-8">{children}</main>
      <MobileTabBar role={role} />
    </div>
  );
}
