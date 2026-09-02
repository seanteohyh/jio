"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Daily Activity Log's page-view beacon (§3/§4) — pings once on mount and
 * once per real route change. `usePathname()` only changes on an actual
 * navigation, never on a prefetch (those don't run client code at all),
 * so `page_view_count` reflects real views. Mounted only for a signed-in
 * user — see `layout.tsx` — so there's nothing to beacon while signed out.
 */
export default function AppVisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/track/visit", { method: "POST" }).catch(() => {
      // Best-effort — a failed beacon must never affect navigation.
    });
  }, [pathname]);

  return null;
}
