import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { DEFAULT_OFFICE } from "@/lib/constants";

export async function GET() {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const events = await repo.listEvents(user.id);
    return json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateEventBody {
  title?: string;
  scheduled_at?: string;
  office_id?: string;
  place_ids?: string[];
  kaki_id?: string | null;
  invitee_ids?: string[];
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreateEventBody>(request);

    if (!body) return badRequest("Expected a JSON body");

    const title = body.title?.trim() || "Lunch";
    const scheduledAt = body.scheduled_at;
    if (!scheduledAt) return badRequest("When is this Jio?");

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return badRequest("That does not look like a valid date and time");
    }

    const event = await repo.createEvent(
      user.id,
      title,
      when.toISOString(),
      body.office_id ?? DEFAULT_OFFICE.id,
      body.place_ids ?? [],
      body.kaki_id ?? null,
      body.invitee_ids ?? []
    );

    return json({ event }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
