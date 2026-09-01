import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json } from "@/lib/api";

/**
 * The admin queue for general (non-place) reports — UX review log #17.
 * Same admin-only shape as `/api/admin/flags`, just its own list rather
 * than merged into place flags' place-grouped one; the moderation page
 * renders both queues on the same screen so nothing needs a separate inbox.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const reports = await repo.listPendingGeneralReports();
    return json({ reports });
  } catch (error) {
    return errorResponse(error);
  }
}
