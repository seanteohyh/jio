import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { DEFAULT_OFFICE } from "@/lib/constants";
import { sendPushToUsers } from "@/lib/push";
import { expandInvitees } from "@/lib/events";
import type { Repo } from "@/lib/data";

/** Best-effort — a push failure must never fail the Jio it's announcing. */
async function notifyInvitees(
  repo: Repo,
  invitees: string[],
  eventId: string,
  title: string
): Promise<void> {
  if (invitees.length === 0) return;
  try {
    await sendPushToUsers(repo, invitees, {
      title: "You're invited to a Jio",
      body: title,
      url: `/events/${eventId}`,
    });
  } catch {
    // Logged inside sendPushToUsers already; nothing more to do here.
  }
}

/**
 * "Starting soon" reminder to anyone with a stake in `userId`'s own Jios who
 * hasn't voted or RSVP'd yet — lazy, page-load-triggered, same shape as
 * `generateDueOccurrences` just above. See 039_close_reminder.sql for why.
 */
async function remindUpcoming(repo: Repo, userId: string): Promise<void> {
  try {
    const due = await repo.remindDueEvents(userId);
    for (const item of due) {
      try {
        await sendPushToUsers(repo, item.recipientIds, {
          title: "Starting soon",
          body: `${item.title} is in 30 minutes — you haven't voted or RSVP'd yet`,
          url: `/events/${item.eventId}`,
        });
      } catch {
        // Logged inside sendPushToUsers already; one event's failure
        // shouldn't stop the rest.
      }
    }
  } catch {
    // remindDueEvents itself failing must never break loading the list.
  }
}

export async function GET() {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    // Lazy generation: whoever hosts a recurring series triggers its next
    // occurrence just by loading their own Jios list. See
    // 031_recurring_series.sql for why this isn't cron-driven.
    await repo.generateDueOccurrences(user.id);
    // Same lazy trigger, for the "starting soon" reminder — see
    // 039_close_reminder.sql.
    await remindUpcoming(repo, user.id);
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
  /** Display provenance — "Jio with the lunch kakis". */
  kaki_id?: string | null;
  /** Groups whose members should be invited. See `expandInvitees`. */
  kaki_ids?: string[];
  invitee_ids?: string[];
  /** Presence of this field (2+ entries) is what makes this a Flexi Jio. */
  candidate_dates?: string[];
  /** Flexi Jio only — "HH:MM", Singapore local. Defaults to noon. */
  time_of_day?: string;
  /** §14 — set only here, at creation. No edit path exists once a Jio has
   *  votes to hide. */
  hide_votes?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(request: NextRequest) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreateEventBody>(request);

    if (!body) return badRequest("That didn't save — mind trying again?");
    const title = body.title?.trim() || "Lunch";

    const kakiIds = body.kaki_ids ?? (body.kaki_id ? [body.kaki_id] : []);
    const invitees = await expandInvitees(
      repo,
      user.id,
      body.invitee_ids ?? [],
      kakiIds
    );
    const kakiId = body.kaki_id ?? kakiIds[0] ?? null;

    if (body.candidate_dates) {
      const dates = body.candidate_dates.filter((d) => DATE_RE.test(d));
      if (dates.length < 2) {
        return badRequest("A Flexi Jio needs at least 2 candidate dates");
      }
      if (body.time_of_day && !TIME_RE.test(body.time_of_day)) {
        return badRequest("That does not look like a valid time");
      }

      const event = await repo.createFlexiEvent(
        user.id,
        title,
        body.office_id ?? DEFAULT_OFFICE.id,
        dates,
        kakiId,
        invitees,
        body.hide_votes ?? false,
        body.time_of_day
      );
      await notifyInvitees(repo, invitees, event.id, title);
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
      kakiId,
      invitees,
      body.hide_votes ?? false
    );
    await notifyInvitees(repo, invitees, event.id, title);

    return json({ event }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
