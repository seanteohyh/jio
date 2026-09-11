import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { logAction } from "@/lib/actions";

/**
 * Favourites: a second, independent personal list from the wishlist ("Want
 * to try") — a place can be saved to either, both, or neither. Same
 * "toggle, no separate add/remove endpoints" shape as `/api/wishlist`.
 */
export async function GET() {
  const blocked = featureGate("favourites");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const favourites = await repo.listFavourites(user.id);
    return json({ favourites });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("favourites");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ place_id?: string }>(request);

    if (!body?.place_id) return badRequest("Which place?");

    const result = await repo.toggleFavourite(user.id, body.place_id);
    if (result.added) {
      await logAction(repo, user.id, "place.favourited", {
        placeId: body.place_id,
      });
    }
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
