import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

/**
 * Admin-only. Authorization lives in `repo.unblockPlace` (RLS + the
 * `unblock_place` SECURITY DEFINER function in live mode); this route just
 * translates the result.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const place = await repo.unblockPlace(user.id, id);
    return json({ place });
  } catch (error) {
    return errorResponse(error);
  }
}
