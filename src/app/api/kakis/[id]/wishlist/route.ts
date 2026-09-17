import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { logAction } from "@/lib/actions";

type Params = { params: Promise<{ id: string }> };

/**
 * Group-level counterpart to `/api/wishlist` — any current member of the
 * Kaki may list, add to, or remove from it (see migration 093's RLS; the
 * repo methods re-check membership app-side too, same "belt and braces"
 * reasoning `updateVisit` already documents for demo mode having no RLS
 * to lean on).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const wishlist = await repo.listKakiWishlist(id);
    return json({ wishlist });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const body = await readJson<{ place_id?: string }>(request);

    if (!body?.place_id) return badRequest("Which place?");

    const entry = await repo.addKakiWishlistEntry(id, user.id, body.place_id);
    await logAction(repo, user.id, "kaki.wishlisted", {
      kakiId: id,
      placeId: body.place_id,
    });
    return json({ entry }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
