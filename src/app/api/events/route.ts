import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { DEFAULT_OFFICE } from "@/lib/constants";
import { sendPushToUsers } from "@/lib/push";
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
  /** §14 — set only here, at creation. No edit path exists once a Jio has
   *  votes to hide. */
  hide_votes?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn the picker's selection into a flat invitee list.
 *
 * A chosen group is **snapshotted** — its members become individual invitees
 * right now, rather than being resolved from live membership later. Migration
 * 019 settled this for lobangs and the same reasoning applies: if membership
 * were read at read-time, someone joining the group next week would silently
 * become a person who "was invited" to last week's lunch, and someone leaving
 * would vanish from it.
 *
 * The group id is *also* kept on the event (`kaki_id`) so the Jio can still say
 * who it was with. Both, not either.
 *
 * Deliberately server-side: the client has no business deciding who counts as a
 * member, and `getKaki` is already subject to the same RLS as everything else.
 * Overlaps are deduped silently — picking a group and then someone already in
 * it is a normal thing to do, not an error. The host is dropped because they
 * are the host.
 */
async function expandInvitees(
  repo: Repo,
  hostId: string,
  explicit: string[],
  kakiIds: string[]
): Promise<string[]> {
  const ids = new Set(explicit);

  for (const kakiId of kakiIds) {
    const kaki = await repo.getKaki(kakiId);
    if (!kaki) continue;
    for (const member of kaki.members) ids.add(member.user_id);
  }

  ids.delete(hostId);
  return [...ids];
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

      const event = await repo.createFlexiEvent(
        user.id,
        title,
        body.office_id ?? DEFAULT_OFFICE.id,
        dates,
        kakiId,
        invitees,
        body.hide_votes ?? false
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
