// Single source of truth for the dashboard navigation, shared by the desktop top
// nav (layout) and the mobile bottom tab bar so they never drift. Role-gated to
// match the freemium split: staff get the Library; parents/athletes (the payers)
// get Weekly Programs + Membership; admins get Insights.

import type { UserRole } from "@/lib/types";

export type NavLink = { href: string; label: string };

export function navLinks(role: UserRole): NavLink[] {
  const staff = role === "coach" || role === "club_admin" || role === "admin";
  const payer = role === "parent" || role === "athlete";

  return [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/athletes", label: "Athletes" },
    { href: "/dashboard/squad", label: "Squad" },
    { href: "/dashboard/training", label: "Training" },
    ...(staff ? [{ href: "/dashboard/library", label: "Library" }] : []),
    { href: "/dashboard/challenge", label: "Matchday" },
    ...(payer ? [{ href: "/dashboard/program", label: "Programs" }] : []),
    { href: "/dashboard/coach", label: "Coach" },
    { href: "/dashboard/ladder", label: "The Ladder" },
    ...(payer ? [{ href: "/dashboard/billing", label: "Membership" }] : []),
    ...(role === "admin" ? [{ href: "/dashboard/insights", label: "Insights" }] : []),
  ];
}

// The (up to 4) primary tabs pinned in the mobile bottom bar; everything else
// lives behind the "More" tab so nothing is unreachable on a phone. Payers see
// their flagship paid surface (Programs); staff see the Library.
export function primaryMobileHrefs(role: UserRole): string[] {
  const staff = role === "coach" || role === "club_admin" || role === "admin";
  return staff
    ? ["/dashboard", "/dashboard/training", "/dashboard/challenge", "/dashboard/library"]
    : ["/dashboard", "/dashboard/training", "/dashboard/challenge", "/dashboard/program"];
}
