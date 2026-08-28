"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * CHANGES_20260821_combined.md Part 1 §A — the analytics dashboard's
 * multi-view restructure: one long scrolling page split into real routes,
 * so each view can grow independently instead of everything living on one
 * ever-longer page. Plain routes, not client-side tab state — each view
 * gets its own URL, shareable and bookmarkable, and only fetches what it
 * actually renders.
 */
const TABS = [
  { href: "/admin/analytics", label: "Overview" },
  { href: "/admin/analytics/users", label: "Users" },
  { href: "/admin/analytics/places", label: "Places" },
  { href: "/admin/analytics/social", label: "Social" },
  { href: "/admin/analytics/moderation", label: "Moderation" },
  { href: "/admin/analytics/wishlist", label: "Wishlist" },
  { href: "/admin/analytics/performance", label: "Performance" },
] as const;

export default function AdminAnalyticsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Carries the shared `?days=` date-range selection across tabs — without
  // this, following a tab link would silently reset it back to the default.
  const days = searchParams.get("days");
  const query = days ? `?days=${days}` : "";

  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin/analytics"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${query}`}
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-ember text-white"
                : "border-line bg-paper text-stone border hover:border-ember hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
