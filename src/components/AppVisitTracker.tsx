"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Daily Activity Log's page-view beacon (§3/§4) — pings once on mount and
 * once per real route change. `usePathname()` only changes on an actual
 * navigation, never on a prefetch (those don't run client code at all),
 * so `page_view_count` reflects real views. Mounted only for a signed-in
 * user — see `layout.tsx` — so there's nothing to beacon while signed out.
 *
 * The endpoint is `/api/activity/ping`, deliberately not `/api/track/*`
 * (its original name) — ad-blockers and corporate filtering proxies
 * commonly block any path containing "track", and the failed fetch below
 * swallows that completely silently, making an otherwise-real signed-in
 * session invisible to the Daily Activity Log with no error anywhere.
 */
export default function AppVisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/activity/ping", { method: "POST" }).catch(() => {
      // Best-effort — a failed beacon must never affect navigation.
    });
  }, [pathname]);

  return null;
}
