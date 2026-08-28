import { sendPushToUsers } from "@/lib/push";
import type { EventDetail } from "@/types";
import type { Repo } from "@/lib/data";

/**
 * Everyone with a stake in this Jio — host, invitees, kaki members, anyone
 * who voted or RSVP'd. The same broad "relevant to me" set `listEvents()`
 * already uses, host included: a push confirming your own action is
 * harmless. Shared by close, reopen, and auto-close — three different
 * triggers landing on the same "who should hear about this" question.
 */
export async function eventParticipantIds(
  repo: Repo,
  event: EventDetail
): Promise<string[]> {
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

/** The "Decided: X" push — fired on any close, manual or automatic. */
export async function notifyEventDecided(
  repo: Repo,
  event: EventDetail
): Promise<void> {
  try {
    const winner = event.winner_place_name ?? event.winner_label;
    await sendPushToUsers(repo, await eventParticipantIds(repo, event), {
      title: winner ? `Decided: ${winner}` : `${event.title} closed`,
      body: winner
        ? `${event.title} — you're going to ${winner}`
        : "Closed without a winner — nobody voted in time.",
      url: `/events/${event.id}`,
    });
  } catch {
    // Best-effort — see notifyInvitees in api/events/route.ts.
  }
}
