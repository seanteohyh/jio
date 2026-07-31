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
  /** Presence of this field (2+ entries) is what makes this a Flexi Jio. */
  candidate_dates?: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreateEventBody>(request);

    if (!body) return badRequest("Expected a JSON body");
    const title = body.title?.trim() || "Lunch";

    if (body.candidate_dates) {
      const dates = body.candidate_dates.filter((d) => DATE_RE.test(d));
      if (dates.length < 2) {
        return badRequest("A Flexi Jio needs at least 2 candidate dates");
      }

      const event = await repo.createFlexiEvent(
        user.id,
        title,
        body.office_id ?? DEFAULT_OFFICE.id,
        dates,
        body.kaki_id ?? null,
        body.invitee_ids ?? []
      );
      return json({ event }, 201);
    }

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
