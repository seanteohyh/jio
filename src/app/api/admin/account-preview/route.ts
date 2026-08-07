import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json } from "@/lib/api";

/**
 * Row counts per table for one or more accounts — §5's "preview what will
 * move before committing" requirement. `?user_id=` may repeat, so the admin
 * UI can preview the keeper and every candidate to merge in with one call.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const { searchParams } = new URL(request.url);
    const userIds = searchParams.getAll("user_id");
    if (userIds.length === 0) return badRequest("Which account(s)?");

    const previews = await Promise.all(
      userIds.map((id) => repo.previewAccountMerge(id))
    );
    return json({ previews });
  } catch (error) {
    return errorResponse(error);
  }
}
