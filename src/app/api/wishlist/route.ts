import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { logAction } from "@/lib/actions";

export async function GET() {
  const blocked = featureGate("wishlist");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const wishlist = await repo.listWishlist(user.id);
    return json({ wishlist });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("wishlist");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ place_id?: string }>(request);

    if (!body?.place_id) return badRequest("Which place?");

    const result = await repo.toggleWishlist(user.id, body.place_id);
    // Add-only — a removal isn't "activity" worth logging, same reasoning
    // `place.wishlisted` names an action rather than a state.
    if (result.added) {
      await logAction(repo, user.id, "place.wishlisted", {
        placeId: body.place_id,
      });
    }
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
