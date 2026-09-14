import type { Repo } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

/**
 * Derives a vote deadline from a Jio's own start time and a host-chosen
 * offset — the single place this arithmetic happens, so `createEvent`,
 * `confirmEventDate` (a Flexi Jio's date resolving), `rescheduleEvent`, and
 * `setVoteDeadlineOffset` all agree on what "3 hours before" means. `null`
 * offset (or a missing `scheduledAt`, for a still-polling Flexi Jio) means
 * no deadline — today's full-consensus-only auto-close behavior.
 */
export function computeVoteEndAt(
  scheduledAt: string | null | undefined,
  offsetMinutes: number | null | undefined
): string | null {
  if (!scheduledAt || offsetMinutes == null) return null;
  return new Date(
    new Date(scheduledAt).getTime() - offsetMinutes * 60000
  ).toISOString();
}

/**
 * The deadline mention appended to invite-push copy — "You're invited to a
 * Jio" only ever said the title before; a shared/pushed invite otherwise
 * gave no hint there's a clock. Shared by both invite-push call sites
 * (creation and "invite more people"), same reasoning as `expandInvitees`
 * above. Empty string when there's no deadline, so callers can just
 * concatenate it onto the body they already build.
 */
export function formatVoteDeadlineText(
  voteEndAt: string | null | undefined
): string {
  return voteEndAt ? ` — voting closes ${formatDateTime(voteEndAt)}` : "";
}

/**
 * Turn a picker's selection (people plus groups) into a flat invitee list.
 *
 * A chosen group is **snapshotted** — its members become individual invitees
 * right now, rather than being resolved from live membership later. Migration
 * 019 settled this for lobangs and the same reasoning applies: if membership
 * were read at read-time, someone joining the group next week would silently
 * become a person who "was invited" to last week's lunch, and someone leaving
 * would vanish from it.
 *
 * Deliberately server-side: the client has no business deciding who counts as
 * a member, and `getKaki` is already subject to the same RLS as everything
 * else. Overlaps are deduped silently — picking a group and then someone
 * already in it is a normal thing to do, not an error. The host is dropped
 * because they are the host.
 *
 * Shared by `POST /api/events` (creation) and `POST /api/events/[id]/invitees`
 * (CHANGES_20260819b.md — inviting more people after the fact) — same
 * expansion either way, not two copies that could drift.
 */
export async function expandInvitees(
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
