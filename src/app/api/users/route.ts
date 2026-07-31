import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";

/**
 * Powers the invite picker. Names only, no emails.
 *
 * `?q=` filters by display name. The filtering happens here rather than in the
 * browser so the response stays small as the team grows — a client-side filter
 * over "every user" keeps working while quietly getting heavier, with no point
 * at which it obviously breaks.
 *
 * This is still not a database-level filter: `listAllUsers()` fetches, then we
 * narrow. That is deliberate for now — changing the Repo signature would ripple
 * through both implementations and the conformance test — but it is the next
 * thing to fix if the user count ever gets interesting. See
 * `docs/user-discovery.md` §4.1, which also covers scoping results to the
 * caller's office.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const repo = await getRepoAsync();
    const users = await repo.listAllUsers();

    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.display_name.toLowerCase().includes(q))
      : users;

    return json({ users: filtered });
  } catch (error) {
    return errorResponse(error);
  }
}
