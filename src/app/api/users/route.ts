import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { features } from "@/lib/config";
import { DEFAULT_OFFICE } from "@/lib/constants";

/**
 * Powers every teammate picker (invite, add-to-Kaki, lobang recipients).
 * Names only, no emails.
 *
 * `?q=` filters by display name, server-side, in `listAllUsers()` itself —
 * not fetched-then-narrowed here. See docs/user-discovery.md §4.1.
 *
 * Also scoped to the caller's office, resolved from their own
 * `user_prefs.default_office_id` (falling back to the default office) — the
 * only per-user office reference the schema has today. Office is a hard
 * boundary for discovery per §6 of that doc: under PDPA, a flat cross-office
 * list is a privacy posture, not just a UI, and the wrong one.
 *
 * Ordered by co-attendance, not alphabetically, per §4.2 — see
 * `listAllUsers`'s own doc comment for the three tiers. `?include_id=`
 * (repeatable) force-includes specific ids regardless of tier or query
 * match, so a multi-select picker can keep resolving an already-picked
 * person's name after the search that originally surfaced them changes.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    let officeId: string | undefined;
    if (features.offices) {
      const prefs = await repo.getUserPrefs(user.id);
      officeId = prefs?.default_office_id ?? DEFAULT_OFFICE.id;
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const includeIds = searchParams.getAll("include_id");
    const users = await repo.listAllUsers(user.id, q, officeId, includeIds);

    return json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}
