import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json } from "@/lib/api";

/**
 * Place + profile-preference counts per candidate cuisine slug —
 * CHANGES_20260818.md §6's admin combine tool, same "preview what will
 * move before committing" shape as `account-preview`. `?slug=` may repeat.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const { searchParams } = new URL(request.url);
    const slugs = searchParams.getAll("slug");
    if (slugs.length === 0) return badRequest("Which cuisine(s)?");

    const previews = await repo.previewCuisineMerge(slugs);
    return json({ previews });
  } catch (error) {
    return errorResponse(error);
  }
}
