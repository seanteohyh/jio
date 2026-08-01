import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/**
 * Add a place to an open Jio — or, with `label` instead of `place_id`, a
 * free-text option with no `places` row behind it yet ("vote first, prompt
 * after," CHANGES_20260801.md §8).
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

    const body = await readJson<{ place_id?: string; label?: string }>(
      request
    );
    if (body?.label) {
      const option = await repo.addFreeTextOptionToEvent(
        id,
        body.label,
        user.id
      );
      const event = await repo.getEvent(id);
      return json({ ok: true, event, option });
    }

    if (!body?.place_id) return badRequest("Which place?");

    await repo.addOptionToEvent(id, body.place_id, user.id);

    const event = await repo.getEvent(id);
    return json({ ok: true, event });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Upgrades a free-text option to a real place, once the "add it to the
 * pool?" prompt is accepted. See `attachPlaceToOption` for why this is its
 * own gated path rather than a field on the plain PUT this route doesn't
 * even have.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{
      old_place_id?: string;
      new_place_id?: string;
    }>(request);
    if (!body?.old_place_id || !body?.new_place_id) {
      return badRequest("Expected old_place_id and new_place_id");
    }

    await repo.attachPlaceToOption(
      id,
      body.old_place_id,
      body.new_place_id,
      user.id
    );

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
