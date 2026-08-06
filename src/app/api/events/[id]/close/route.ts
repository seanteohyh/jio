import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { sendPushToUsers } from "@/lib/push";
import type { EventDetail } from "@/types";
import type { Repo } from "@/lib/data";

type Params = { params: Promise<{ id: string }> };

/**
 * Everyone with a stake in this Jio — host, invitees, kaki members, anyone
 * who voted or RSVP'd. Deliberately the same broad "relevant to me" set
 * listEvents() already uses, host included: a push confirming your own
 * close is harmless, and this is the one moment — §2c's resolved-vote
 * animation, reaching people whose app isn't open — the whole feature
 * exists for.
 */
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
 * Close the vote and lock in a winner.
 *
 * With no body, the Borda count decides. With `winner_place_id`, the host is
 * overriding — either because the roulette wheel spun, or because they simply
 * decided. Only the host can do either.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ winner_place_id?: string | null }>(request);

    const event = await repo.closeEvent(
      id,
      user.id,
      body?.winner_place_id ?? null
    );

    try {
      const winner = event.winner_place_name ?? event.winner_label;
      await sendPushToUsers(repo, await participantIds(repo, event), {
        title: winner ? `Decided: ${winner}` : `${event.title} closed`,
        body: winner
          ? `${event.title} — you're going to ${winner}`
          : "Closed without a winner — nobody voted in time.",
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
