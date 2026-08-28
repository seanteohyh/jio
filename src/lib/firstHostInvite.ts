import type { InviteSelection } from "@/components/InvitePicker";
import type { EventDetail, LunchEvent } from "@/types";

/**
 * CHANGES_20260821_combined2.md §3C — which past Jio should supply the
 * pre-checked co-attendees for a first-ever "Start a Jio" attempt.
 *
 * Gated on "never hosted before," not "never joined before" — an account
 * that has hosted anything at all, even once, reverts to today's ordinary
 * empty/ranked picker from then on (`null` here). Among the Jios joined as
 * a guest, the most recently scheduled one is used — closest match to "the
 * Jio they just joined" for the common case (a first-timer who arrived via
 * a single invite link), and it degrades sensibly if there happen to be
 * several.
 */
export function pickFirstHostSourceEvent(
  events: LunchEvent[],
  userId: string
): LunchEvent | null {
  if (events.some((e) => e.host_id === userId)) return null;

  const joined = events
    .filter((e) => e.host_id !== userId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return joined[0] ?? null;
}

/**
 * "Co-attendees" = that source Jio's host plus everyone explicitly invited
 * to it, as individual people — never a Kaki group, even if one was used
 * to create the source Jio (its invitees are already the expanded
 * individual membership, per InvitePicker's own note on that). `userId`
 * itself is excluded in case it turns up in the source's own invitee list.
 */
export function buildFirstHostInvite(
  source: EventDetail,
  userId: string
): InviteSelection | null {
  const userIds = Array.from(
    new Set([source.host_id, ...source.invitees.map((i) => i.user_id)])
  ).filter((id) => id !== userId);

  return userIds.length > 0 ? { userIds, kakiIds: [] } : null;
}
