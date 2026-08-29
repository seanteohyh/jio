import type { EventStatus, RsvpResponse } from "@/types";

/**
 * UX review log #25 — whether *this* load of *this* event's page should
 * show the decided-Jio celebration. Generalised from the original one-time
 * "first decided Jio ever" version (migration 067): every decided Jio a
 * viewer RSVP'd and voted on now gets its own celebration, the first time
 * they see its page in that state — gated additionally on the Jio's lunch
 * still being ahead of it, so opening a decided Jio whose lunch has already
 * happened goes straight to the resting "Decided" record instead of
 * replaying a celebration for something already over.
 */
export function qualifiesForDecidedCelebration(params: {
  alreadySeen: boolean;
  eventStatus: EventStatus;
  isUpcoming: boolean;
  myRsvp: RsvpResponse | null;
  myVoteCount: number;
}): boolean {
  return (
    !params.alreadySeen &&
    params.eventStatus === "closed" &&
    params.isUpcoming &&
    params.myRsvp !== null &&
    params.myVoteCount > 0
  );
}
