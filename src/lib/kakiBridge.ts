import type { EventStatus } from "@/types";

/**
 * "Turn this into a Kaki?" — whether *this* load of *this* Jio's page
 * should show the bridge prompt into creating a Kaki from its exact group
 * of participants. Host-only (only the person who'd naturally decide to
 * formalize the group sees it, same as only the host can add/remove
 * invitees today), and only for a plain ad-hoc Jio — one already linked
 * to a Kaki (`kakiId`) has nothing to bridge, the group already is one.
 * A solo Jio (host only, nobody else) has nobody to form a group with.
 *
 * Not stamped as "seen" just by qualifying, unlike the decided
 * celebration this otherwise resembles: staying visible across reloads
 * until the host explicitly dismisses it, or actually creates the Kaki
 * (which stops it qualifying on its own — see `alreadyHasMatchingKaki`).
 */
export function qualifiesForKakiBridgeSuggestion(params: {
  isHost: boolean;
  eventStatus: EventStatus;
  hasWinner: boolean;
  alreadyLinkedToKaki: boolean;
  participantCount: number;
  alreadyDismissed: boolean;
  alreadyHasMatchingKaki: boolean;
}): boolean {
  return (
    params.isHost &&
    params.eventStatus === "closed" &&
    params.hasWinner &&
    !params.alreadyLinkedToKaki &&
    params.participantCount >= 2 &&
    !params.alreadyDismissed &&
    !params.alreadyHasMatchingKaki
  );
}
