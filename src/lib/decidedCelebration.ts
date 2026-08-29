import type { EventStatus } from "@/types";

/**
 * UX review log #25 — whether *this* load of *this* event's page should
 * show the decided-Jio celebration. Generalised from the original one-time
 * "first decided Jio ever" version (migration 067): every decided Jio a
 * viewer voted on now gets its own celebration, the first time they see
 * its page in that state — gated additionally on the Jio's lunch still
 * being ahead of it, so opening a decided Jio whose lunch has already
 * happened goes straight to the resting "Decided" record instead of
 * replaying a celebration for something already over.
 *
 * Originally also required a separate RSVP ("myRsvp !== null"), on the
 * theory that RSVP-ing was the real signal of participation. Dropped:
 * RSVP and voting are two independent actions in the UI, so it's entirely
 * normal to vote without ever clicking an RSVP button — and doing so
 * silently, permanently skipped the celebration for that person even
 * though they'd just voted and decided the Jio. A cast vote is itself a
 * clear, sufficient signal of participation.
 */
export function qualifiesForDecidedCelebration(params: {
  alreadySeen: boolean;
  eventStatus: EventStatus;
  isUpcoming: boolean;
  myVoteCount: number;
}): boolean {
  return (
    !params.alreadySeen &&
    params.eventStatus === "closed" &&
    params.isUpcoming &&
    params.myVoteCount > 0
  );
}
