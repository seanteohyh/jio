import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json } from "@/lib/api";

/**
 * The admin resolution queue: every pending flag, oldest first, hydrated
 * with the place name and the flagger's name. Admin only — see
 * `/api/admin/moderation-log` for why this checks explicitly rather than
 * relying on RLS alone (demoRepo has no RLS to lean on).
 */
export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const flags = await repo.listPendingFlags();
    return json({ flags });
  } catch (error) {
    return errorResponse(error);
  }
}
