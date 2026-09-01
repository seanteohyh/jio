import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/**
 * Edits or removes an existing office — same admin gate as `POST
 * /api/offices` (see that route's own comment), and for the same reason
 * this exists at all: adding a second office row never changed anything
 * the app actually uses, since every write path that needs "the" office
 * and wasn't given one explicitly falls back to the same fixed
 * `DEFAULT_OFFICE.id`. Editing the existing row in place is what actually
 * moves it.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("offices");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Only an admin can edit an office");

    const body = await readJson<{
      name?: string;
      address?: string | null;
      lat?: number;
      lng?: number;
    }>(request);
    if (!body) return badRequest("That didn't save — mind trying again?");

    const patch: {
      name?: string;
      address?: string | null;
      lat?: number;
      lng?: number;
    } = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) return badRequest("An office name is required");
      patch.name = body.name.trim();
    }
    if (body.address !== undefined) {
      patch.address = body.address?.trim() || null;
    }
    if (body.lat !== undefined || body.lng !== undefined) {
      if (typeof body.lat !== "number" || typeof body.lng !== "number") {
        return badRequest("Latitude and longitude must both be set together");
      }
      patch.lat = body.lat;
      patch.lng = body.lng;
    }
    if (Object.keys(patch).length === 0) {
      return badRequest("Nothing to update");
    }

    const office = await repo.updateOffice(id, patch);
    return json({ office });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("offices");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Only an admin can remove an office");

    await repo.deleteOffice(id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
