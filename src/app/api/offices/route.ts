import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

export async function GET() {
  try {
    await requireUser();
    const repo = await getRepoAsync();
    const offices = await repo.listOffices();
    return json({ offices });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("offices");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    // Adding an office spends real external API calls (Overpass discovery,
    // OneMap routing) on everyone's behalf going forward — same admin gate
    // as place moderation, not open to any signed-in user. RLS enforces
    // this too in live mode (see offices_insert in
    // 017_admin_and_moderation.sql); demo mode has no RLS to lean on, so it
    // needs this app-side check to behave the same way.
    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Only an admin can add a new office");

    const body = await readJson<{
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
    }>(request);

    if (!body?.name?.trim()) return badRequest("An office name is required");
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return badRequest("Latitude and longitude are required");
    }

    const office = await repo.createOffice({
      name: body.name.trim(),
      address: body.address?.trim() || null,
      lat: body.lat,
      lng: body.lng,
    });

    return json({ office }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
