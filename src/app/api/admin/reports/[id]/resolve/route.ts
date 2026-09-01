import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * Resolves one general report — admin only. Unlike `/api/admin/flags/
 * [placeId]/resolve`, this is one row at a time: there's no place to
 * group by the way place flags batch-resolve per place.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    await repo.resolveGeneralReport(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
