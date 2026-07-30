import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

/**
 * "Remove" a place from view — the place's own creator, or an admin, may do
 * this. Actual authorization lives in `repo.blockPlace` (RLS + the
 * `block_place` SECURITY DEFINER function in live mode); this route just
 * validates the request shape and translates the result.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ reason?: string }>(request);
    const reason = body?.reason?.trim();
    if (!reason) {
      return badRequest("A reason is required to block a place");
    }

    const place = await repo.blockPlace(user.id, id, reason);
    return json({ place });
  } catch (error) {
    return errorResponse(error);
  }
}
