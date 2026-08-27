import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, notFound, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/**
 * Sets or clears (`lead_minutes: null`) the caller's own per-Jio reminder
 * override — CHANGES_20260821c.md §1. Confirmed-going only, same gate the
 * UI uses to decide whether to even show the control: a reminder override
 * for a Jio you haven't said you're going to means nothing.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");

    const myRsvp = event.rsvps.find((r) => r.user_id === user.id)?.response;
    if (myRsvp !== "yes") {
      return badRequest(
        "Only someone confirmed going can set a reminder for this Jio"
      );
    }

    const body = await readJson<{ lead_minutes?: number | null }>(request);
    if (!body || !("lead_minutes" in body)) {
      return badRequest("Expected { lead_minutes: number | null }");
    }

    const { lead_minutes: leadMinutes } = body;
    if (
      leadMinutes !== null &&
      (typeof leadMinutes !== "number" ||
        !Number.isFinite(leadMinutes) ||
        leadMinutes <= 0)
    ) {
      return badRequest(
        "lead_minutes must be a positive number of minutes, or null to use your default"
      );
    }

    await repo.setEventReminderOverride(id, user.id, leadMinutes);
    return json({ ok: true, lead_minutes: leadMinutes });
  } catch (error) {
    return errorResponse(error);
  }
}
