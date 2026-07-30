import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json, numberParam } from "@/lib/api";

/**
 * Every block/unblock, who did it, when, and (for blocks) why — the
 * moderation view's data source. Admin only.
 *
 * In live mode the `place_moderation_log_select` RLS policy would already
 * refuse a non-admin's query, but demoRepo has no RLS to lean on, so this
 * route checks explicitly rather than relying on the database alone in
 * every mode.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const { searchParams } = new URL(request.url);
    const limit = numberParam(searchParams, "limit", 100);

    const log = await repo.listModerationLog(limit);
    return json({ log });
  } catch (error) {
    return errorResponse(error);
  }
}
