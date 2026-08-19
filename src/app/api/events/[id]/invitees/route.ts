import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { sendPushToUsers } from "@/lib/push";
import { expandInvitees } from "@/lib/events";

type Params = { params: Promise<{ id: string }> };

/**
 * Invite more people to an already-created Jio — CHANGES_20260819b.md, "host
 * can add or remove users, both before and after confirmed." Host-only
 * (`addInviteesToEvent`), and deliberately has no status check: a host
 * closing a Jio doesn't stop being able to say who's coming.
 *
 * Accepts groups (`kaki_ids`) as well as people (`user_ids`), same
 * `expandInvitees` snapshot-at-invite-time semantics `POST /api/events`
 * uses at creation — a group picked here isn't tracked, just expanded once.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ user_ids?: string[]; kaki_ids?: string[] }>(
      request
    );
    const userIds = Array.isArray(body?.user_ids) ? body.user_ids : [];
    const kakiIds = Array.isArray(body?.kaki_ids) ? body.kaki_ids : [];
    if (userIds.length === 0 && kakiIds.length === 0) {
      return badRequest("Who's being invited?");
    }

    const invitees = await expandInvitees(repo, user.id, userIds, kakiIds);
    await repo.addInviteesToEvent(id, invitees, user.id);

    const event = await repo.getEvent(id);
    if (event && invitees.length > 0) {
      try {
        await sendPushToUsers(repo, invitees, {
          title: "You're invited to a Jio",
          body: event.title,
          url: `/events/${id}`,
        });
      } catch {
        // Best-effort — see notifyInvitees in api/events/route.ts.
      }
    }

    return json({ ok: true, event: event && redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Removes one invitee — host-only, works regardless of status. Also drops
 * their own RSVP/ballot/date-availability on this event; see
 * `removeInviteeFromEvent`'s doc comment.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) return badRequest("Who's being removed?");

    await repo.removeInviteeFromEvent(id, userId, user.id);

    const event = await repo.getEvent(id);
    return json({ ok: true, event: event && redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
