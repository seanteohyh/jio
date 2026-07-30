import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import {
  badRequest,
  errorResponse,
  json,
  numberParam,
  readJson,
} from "@/lib/api";
import { featureGate } from "@/lib/config";

export async function GET(request: NextRequest) {
  const blocked = featureGate("recos");
  if (blocked) return blocked as NextResponse;

  try {
    await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const placeId = params.get("placeId");
    if (placeId) {
      return json({ recos: await repo.listRecosForPlace(placeId) });
    }

    const limit = numberParam(params, "limit", 20);
    return json({ recos: await repo.listRecos(limit) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("recos");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ place_id?: string; comment?: string }>(
      request
    );

    if (!body?.place_id) return badRequest("Which place are you recommending?");

    const reco = await repo.createReco(
      user.id,
      body.place_id,
      body.comment?.trim() || null
    );
    return json({ reco }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const blocked = featureGate("recos");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const placeId = request.nextUrl.searchParams.get("placeId");

    if (!placeId) return badRequest("Which place?");

    await repo.deleteReco(user.id, placeId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
