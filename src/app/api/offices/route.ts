import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
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
    await requireUser();
    const repo = await getRepoAsync();
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
