import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { sendPushToUsers } from "@/lib/push";
import { eventParticipantIds } from "@/lib/eventNotifications";

type Params = { params: Promise<{ id: string }> };

/**
 * Undo a close and put a Jio back into voting. Host only, only from
 * `closed`, and only while `scheduled_at` is still in the future — see
 * 058_reopen_event.sql for the full gate. Existing ballots are untouched.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const event = await repo.reopenEvent(id, user.id);

    try {
      await sendPushToUsers(repo, await eventParticipantIds(repo, event), {
        title: `Voting reopened: ${event.title}`,
        body: "The host reopened this Jio for voting — cast or change your vote.",
        url: `/events/${id}`,
      });
    } catch {
      // Best-effort — see notifyInvitees in api/events/route.ts.
    }

    return json({ ok: true, event: redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
