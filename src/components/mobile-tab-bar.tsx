"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/types";
import { navLinks, primaryMobileHrefs, type NavLink } from "@/lib/nav";

// Minimal inline icons (stroke = currentColor) so the tab bar needs no icon
// dependency and inherits the bone/signal theming.
const ICONS: Record<string, ReactNode> = {
  "/dashboard": <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  "/dashboard/training": <path d="M3 12h4l2-6 4 13 3-9 1 2h4" />,
  "/dashboard/challenge": (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  "/dashboard/program": (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9zM8.5 13.5l2 2 4-4" />
    </>
  ),
  "/dashboard/library": (
    <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11" />
  ),
};

const MORE_ICON = (
  <>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>
);

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Fixed bottom navigation for phones (hidden at md+, where the top nav takes
// over). Up to four primary tabs plus a "More" sheet holding the rest, so every
// destination stays reachable with a thumb.
export function MobileTabBar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const all = navLinks(role);
  const primaryHrefs = primaryMobileHrefs(role);
  const primary: NavLink[] = primaryHrefs
    .map((href) => all.find((l) => l.href === href))
    .filter((l): l is NavLink => Boolean(l));
  const more = all.filter((l) => !primaryHrefs.includes(l.href));
  const moreActive = more.some((l) => isActive(pathname, l.href));

  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
      active ? "text-signal" : "text-bone/55"
    }`;

  return (
    <>
      {/* Slide-up "More" sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More navigation"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 bg-ink p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <nav className="grid grid-cols-2 gap-2">
              {more.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-signal/50 bg-signal/10 text-signal"
                        : "border-white/10 bg-white/[0.03] text-bone/80 hover:bg-white/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {primary.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              <TabIcon>{ICONS[link.href]}</TabIcon>
              <span>{link.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={tabClass(moreActive || moreOpen)}
        >
          <TabIcon>{MORE_ICON}</TabIcon>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
