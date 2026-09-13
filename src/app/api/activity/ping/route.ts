import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { sgtDateKey, tabForPath } from "@/lib/utils";

/**
 * The page-view beacon — `AppVisitTracker` posts here on mount and on
 * every real route change, with the pathname that triggered it. A 401 for
 * a signed-out caller is expected and harmless: the tracker itself is
 * never mounted while signed out (see `layout.tsx`), so this only fires
 * for a session that expires mid-visit.
 *
 * Deliberately not named `/api/track/*` (its original path) — that
 * substring is a common ad-blocker/privacy-filter match, and a blocked
 * beacon fails completely silently (see `AppVisitTracker`'s `.catch`),
 * making a real signed-in session invisible to the Daily Activity Log
 * with no indication anything went wrong.
 *
 * Records two things per view: the overall daily-visit tally
 * (`trackDailyVisit`, unchanged) and, new here, which of `BottomNav`'s
 * sections the page belongs to (`trackPageView`) — the traffic-by-page
 * breakdown on `/admin/analytics`. A missing/malformed `pathname` in the
 * body (an old cached client, a malformed request) still tracks the daily
 * visit; it just buckets as "Other" rather than failing the whole beacon.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const today = sgtDateKey(new Date());

    let pathname = "";
    try {
      const body = (await request.json()) as { pathname?: unknown };
      if (typeof body?.pathname === "string") pathname = body.pathname;
    } catch {
      // No/invalid JSON body — fall through, bucketed as "Other" below.
    }

    await Promise.all([
      repo.trackDailyVisit(user.id, today),
      repo.trackPageView(user.id, today, tabForPath(pathname)),
    ]);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
