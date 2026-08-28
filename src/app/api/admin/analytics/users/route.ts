import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json, numberParam } from "@/lib/api";

/**
 * Part 1 §B — the Users view's leaderboard, segments, and current
 * engagement weights. Admin only, same reasoning as `/api/admin/analytics`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const { searchParams } = new URL(request.url);
    const days = numberParam(searchParams, "days", 90);

    const usersData = await repo.getAdminUsersData(days);
    return json({ usersData });
  } catch (error) {
    return errorResponse(error);
  }
}
