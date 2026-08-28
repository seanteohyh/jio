import type { EventStatus, RsvpResponse } from "@/types";

/**
 * CHANGES_20260821_combined2.md §3D — whether *this* load of *this* event's
 * page is the one that should show the one-time "first decided Jio"
 * celebration. Deliberately not "the chronologically earliest such Jio in
 * this account's history" — the first qualifying decided Jio this account
 * happens to load a page for, while the profile flag is still unset, is
 * treated as its first-ever experience of the milestone. Any RSVP answer
 * (not specifically "yes") counts, alongside having cast at least one vote.
 */
export function qualifiesForFirstDecidedCelebration(params: {
  alreadyShown: boolean;
  eventStatus: EventStatus;
  myRsvp: RsvpResponse | null;
  myVoteCount: number;
}): boolean {
  return (
    !params.alreadyShown &&
    params.eventStatus === "closed" &&
    params.myRsvp !== null &&
    params.myVoteCount > 0
  );
}
