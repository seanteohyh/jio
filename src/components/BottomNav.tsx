"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { config, features } from "@/lib/config";

/**
 * Primary navigation.
 *
 * One component, two shapes: a thumb-reachable bottom bar on phones and a side
 * rail on desktop. Keeping them in one place means a new destination cannot be
 * added to one and forgotten in the other.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function IconSuggest() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="m9 4-6 2.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

function IconPlaces() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5" />
      <path d="M17 3c-1.5 2-2 4-2 6a2 2 0 0 0 2 2h1V3h-1ZM18 11v10" />
    </svg>
  );
}

function IconEvents() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/", label: "Home", icon: <IconHome />, enabled: true },
    { href: "/suggest", label: "Suggest", icon: <IconSuggest />, enabled: true },
    { href: "/map", label: "Map", icon: <IconMap />, enabled: features.map },
    { href: "/places", label: "Places", icon: <IconPlaces />, enabled: true },
    {
      href: "/events",
      label: "Jios",
      icon: <IconEvents />,
      enabled: features.events,
    },
    { href: "/profile", label: "You", icon: <IconProfile />, enabled: true },
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
        className="border-dolch-border bg-dolch-bg/95 pb-safe fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {visible.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] transition-colors",
                    active
                      ? "text-dolch-accent"
                      : "text-dolch-muted hover:text-dolch-text"
                  )}
                >
                  {item.icon}
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
        className="border-dolch-border bg-dolch-surface/60 fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r px-3 py-6 md:flex"
      >
        <Link
          href="/"
          className="text-dolch-accent mb-8 px-3 text-2xl font-semibold tracking-tight"
        >
          {config.appName}
          <span className="text-dolch-muted mt-1 block text-xs font-normal tracking-normal">
            where are we eating?
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
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-dolch-accent-soft/50 text-dolch-accent font-medium"
                      : "text-dolch-muted hover:bg-dolch-surface hover:text-dolch-text"
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {config.isDemo && (
          <p className="text-dolch-muted border-dolch-border mt-4 rounded-lg border border-dashed px-3 py-2 text-xs">
            Demo mode — data lives in memory and resets when the server
            restarts.
          </p>
        )}
      </nav>
    </>
  );
}
