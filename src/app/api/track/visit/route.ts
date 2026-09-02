import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { sgtDateKey } from "@/lib/utils";

/**
 * The page-view beacon — `AppVisitTracker` posts here on mount and on
 * every real route change. A 401 for a signed-out caller is expected and
 * harmless: the tracker itself is never mounted while signed out (see
 * `layout.tsx`), so this only fires for a session that expires mid-visit.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    await repo.trackDailyVisit(user.id, sgtDateKey(new Date()));
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
