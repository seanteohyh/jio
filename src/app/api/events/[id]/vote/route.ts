import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { sendPushToUsers } from "@/lib/push";
import type { EventDetail } from "@/types";
import type { Repo } from "@/lib/data";

type Params = { params: Promise<{ id: string }> };

/**
 * Throttled to at most one push per event per window (038_vote_push_throttle.sql)
 * — the host hears "people are voting", not one ping per voter. Never fires
 * for the host's own vote on their own Jio.
 */
async function notifyHostOfVote(
  repo: Repo,
  event: EventDetail,
  voterId: string
): Promise<void> {
  if (voterId === event.host_id) return;
  try {
    const claimed = await repo.claimVotePushWindow(event.id);
    if (!claimed) return;
    const voterCount = new Set(event.votes.map((v) => v.user_id)).size;
    await sendPushToUsers(repo, [event.host_id], {
      title: `${voterCount} ${voterCount === 1 ? "person has" : "people have"} voted`,
      body: event.title,
      url: `/events/${event.id}`,
    });
  } catch {
    // Logged inside sendPushToUsers already; a vote must never fail on this.
  }
}

/**
 * Cast a ranked ballot.
 *
 * The body is an ordered list of place ids — position in the array is the
 * rank. Submitting again replaces the previous ballot entirely.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ ranked_place_ids?: string[] }>(request);
    const ranked = body?.ranked_place_ids;

    if (!Array.isArray(ranked)) {
      return badRequest("Expected ranked_place_ids to be an array");
    }
    if (new Set(ranked).size !== ranked.length) {
      return badRequest("You cannot rank the same place twice");
    }

    await repo.castBallot(id, user.id, ranked);

    const event = await repo.getEvent(id);
    if (event) await notifyHostOfVote(repo, event, user.id);
    return json({ ok: true, event: event && redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
