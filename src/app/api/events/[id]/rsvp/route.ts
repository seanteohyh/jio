import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { sendPushToUsers } from "@/lib/push";
import { logAction } from "@/lib/actions";
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
    await logAction(repo, user.id, "jio.rsvp", { eventId: id, response });

    const event = await repo.getEvent(id);

    // A decline can just as easily be the last missing answer as a vote —
    // same "ready to close" prompt `notifyHostOfVote` sends from
    // vote/route.ts, same per-event throttle, just triggered from the
    // other write that can make `readyToClose` newly true. Never fires for
    // the host's own RSVP on their own Jio; they're already looking at it.
    if (event?.readyToClose && user.id !== event.host_id) {
      try {
        const claimed = await repo.claimVotePushWindow(id);
        if (claimed) {
          await sendPushToUsers(repo, [event.host_id], {
            title: "Everyone's answered — ready to close?",
            body: event.title,
            url: `/events/${id}`,
          });
        }
      } catch {
        // Logged inside sendPushToUsers already; an RSVP must never fail on this.
      }
    }

    return json({ ok: true, event: event && redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
