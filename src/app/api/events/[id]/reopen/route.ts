import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { sendPushToUsers } from "@/lib/push";
import type { EventDetail } from "@/types";
import type { Repo } from "@/lib/data";

type Params = { params: Promise<{ id: string }> };

/** Same "who has a stake in this Jio" set close/route.ts's push uses. */
async function participantIds(repo: Repo, event: EventDetail): Promise<string[]> {
  const ids = new Set<string>([event.host_id]);
  for (const i of event.invitees) ids.add(i.user_id);
  for (const v of event.votes) ids.add(v.user_id);
  for (const r of event.rsvps) ids.add(r.user_id);
  if (event.kaki_id) {
    const kaki = await repo.getKaki(event.kaki_id);
    for (const m of kaki?.members ?? []) ids.add(m.user_id);
  }
  return [...ids];
}

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
      await sendPushToUsers(repo, await participantIds(repo, event), {
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
