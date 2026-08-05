import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json, numberParam } from "@/lib/api";

/**
 * §13 admin analytics dashboard, Phase 1. Admin only.
 *
 * In live mode `get_admin_analytics` (migration 035) checks admin status
 * itself before returning anything — it's SECURITY DEFINER, reading across
 * every user's data, so that check is the real gate. This route's own
 * `isAdmin` check exists for the same reason `moderation-log`'s does:
 * demoRepo has no RLS or SECURITY DEFINER to lean on, so every mode needs
 * an explicit check rather than trusting the database alone in some of them.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const { searchParams } = new URL(request.url);
    const days = numberParam(searchParams, "days", 90);

    const analytics = await repo.getAdminAnalytics(days);
    return json({ analytics });
  } catch (error) {
    return errorResponse(error);
  }
}
