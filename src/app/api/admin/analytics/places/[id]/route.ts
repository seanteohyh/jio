import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json, notFound } from "@/lib/api";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

/**
 * Part 1 §C — a single place's analytics drill-down. Admin only, same
 * reasoning as `/api/admin/analytics`: `get_admin_place_detail` (migration
 * 063) is SECURITY DEFINER and checks admin status itself in live mode, but
 * demoRepo has no RLS to lean on, so this route checks explicitly too.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const { id } = await params;
    const detail = await repo.getAdminPlaceDetail(id);
    if (!detail) return notFound("Place not found");

    return json({ detail });
  } catch (error) {
    return errorResponse(error);
  }
}
