import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import type { RsvpResponse } from "@/types";

type Params = { params: Promise<{ id: string }> };

const VALID: RsvpResponse[] = ["yes", "no", "maybe"];

export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ response?: RsvpResponse }>(request);
    const response = body?.response;

    if (!response || !VALID.includes(response)) {
      return badRequest("Response must be yes, no or maybe");
    }

    await repo.rsvp(id, user.id, response);

    const event = await repo.getEvent(id);
    return json({ ok: true, event });
  } catch (error) {
    return errorResponse(error);
  }
}
