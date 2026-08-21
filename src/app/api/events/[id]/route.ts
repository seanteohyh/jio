import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, notFound, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");

    // Whether this viewer may add options — the UI needs to know before it
    // renders the button, and the answer depends on kaki membership.
    let canAddOptions = event.host_id === user.id;
    if (!canAddOptions && event.kaki_id) {
      const kaki = await repo.getKaki(event.kaki_id);
      canAddOptions = Boolean(
        kaki?.members.some((m) => m.user_id === user.id)
      );
    }
    if (!canAddOptions) {
      canAddOptions = event.invitees.some((i) => i.user_id === user.id);
    }

    // Computed from the true event before redaction — a voter still sees
    // their own submitted ranking confirmed even while the aggregate is
    // hidden from everyone, themselves included (see redactHiddenVotes).
    const myVote = event.votes
      .filter((v) => v.user_id === user.id)
      .sort((a, b) => a.rank - b.rank)
      .map((v) => v.place_id);

    return json({
      event: redactHiddenVotes(event),
      viewer: {
        id: user.id,
        isHost: event.host_id === user.id,
        canAddOptions: canAddOptions && event.status === "open",
        myVote,
        myRsvp:
          event.rsvps.find((r) => r.user_id === user.id)?.response ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * CHANGES_20260819c.md §1/§2 — host-only corrections, sharing one route since
 * they live on the same page: "Change date & time" (any time except once
 * cancelled) and "Where did you actually go?" (once closed only). Either
 * field may be sent alone or both together.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const body = await readJson<{
      scheduled_at?: string;
      winner_place_id?: string;
    }>(request);
    if (!body) return badRequest("Expected a JSON body");
    if (!body.scheduled_at && !body.winner_place_id) {
      return badRequest("Nothing to update");
    }

    if (body.scheduled_at) {
      const when = new Date(body.scheduled_at);
      if (Number.isNaN(when.getTime())) {
        return badRequest("That does not look like a valid date and time");
      }
      await repo.rescheduleEvent(id, user.id, when.toISOString());
    }
    if (body.winner_place_id) {
      await repo.editEventWinner(id, user.id, body.winner_place_id);
    }

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");
    return json({ event: redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
