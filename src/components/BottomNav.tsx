"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CircleUser,
  Home,
  MapPin,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { config, features } from "@/lib/config";
import JioMark from "@/components/brand/JioMark";

/**
 * Primary navigation.
 *
 * One component, two shapes: a thumb-reachable bottom bar on phones and a side
 * rail on desktop. Keeping them in one place means a new destination cannot be
 * added to one and forgotten in the other.
 *
 * Icons are Lucide line icons at the system's stroke weight, replacing the
 * hand-rolled SVGs. Active state is Ember plus a 2px top indicator on mobile.
 *
 * Icon note: the design system maps Jios to `Users`. Kakis needs a slot too,
 * and two people-shaped glyphs side by side in a six-tab bar are hard to tell
 * apart at 20px — so Jios takes `CalendarDays` (a Jio is a scheduled outing)
 * and `Users` goes to Kakis (a Kaki is a group of people). Swap the two if you
 * would rather follow the spec to the letter.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

export default function BottomNav() {
  const pathname = usePathname();

  // Suggest is no longer a destination of its own — it is reached from a
  // button on /places. The route still exists, so old links and any installed
  // PWA shortcuts keep working; it just stopped earning a slot in a bar that
  // only has room for the things people open every day.
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: <Home />, enabled: true },
    {
      href: "/events",
      label: "Jios",
      icon: <CalendarDays />,
      enabled: features.events,
    },
    { href: "/kakis", label: "Kaki", icon: <Users />, enabled: features.kakis },
    {
      href: "/places",
      label: "Places",
      icon: <UtensilsCrossed />,
      enabled: true,
    },
    { href: "/map", label: "Map", icon: <MapPin />, enabled: features.map },
    { href: "/profile", label: "You", icon: <CircleUser />, enabled: true },
  ];

  const visible = items.filter((item) => item.enabled);

  // The login page is its own world; navigation would only get in the way.
  if (pathname === "/login") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile: fixed bottom bar */}
      <nav
        aria-label="Main"
        className="border-line bg-paper/95 pb-safe fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur md:hidden"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {visible.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className="relative flex-1">
                {active && (
                  <span
                    aria-hidden="true"
                    className="bg-ember absolute inset-x-3 top-0 h-0.5 rounded-full"
                  />
                )}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-ember" : "text-stone hover:text-ink"
                  )}
                >
                  <span className="[&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.75]">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: side rail */}
      <nav
        aria-label="Main"
        className="border-line bg-cream/60 fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r px-3 py-6 md:flex"
      >
        <Link
          href="/"
          className="mb-8 flex items-center gap-2.5 px-3"
          aria-label={`${config.appName} — home`}
        >
          <JioMark className="h-9 w-9 shrink-0" />
          <span className="font-display text-ember text-2xl font-bold tracking-tight lowercase">
            {config.appName}
          </span>
        </Link>

        <ul className="flex flex-1 flex-col gap-1">
          {visible.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-ember-tint text-ember font-medium"
                      : "text-stone hover:bg-cream hover:text-ink"
                  )}
                >
                  <span className="[&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.75]">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {config.isDemo && (
          <p className="text-stone border-line mt-4 rounded-xl border border-dashed px-3 py-2 text-xs">
            Demo mode — data lives in memory and resets when the server
            restarts.
          </p>
        )}
      </nav>
    </>
  );
}
