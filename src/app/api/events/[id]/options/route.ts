import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/**
 * Add a place to an open Jio.
 *
 * Authorisation lives in the repo (and, definitively, in the RLS policy from
 * migration 013): host, kaki member or explicit invitee only.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ place_id?: string }>(request);
    if (!body?.place_id) return badRequest("Which place?");

    await repo.addOptionToEvent(id, body.place_id, user.id);

    const event = await repo.getEvent(id);
    return json({ ok: true, event });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const placeId = request.nextUrl.searchParams.get("placeId");
    if (!placeId) return badRequest("Which place?");

    await repo.removeOptionFromEvent(id, placeId, user.id);

    const event = await repo.getEvent(id);
    return json({ ok: true, event });
  } catch (error) {
    return errorResponse(error);
  }
}
