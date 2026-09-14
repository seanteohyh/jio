import { NextRequest, NextResponse } from "next/server";
import { getRepoAsync } from "@/lib/data/repo";
import { json, unauthorized } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { VOTE_DEADLINE_REMINDER_LOOKAHEAD_MINUTES } from "@/lib/constants";
import { sendPushToUsers } from "@/lib/push";

/**
 * Vote-deadline sweep — the enforcement half of the vote-deadline feature
 * (088_vote_deadline.sql). A host-set `vote_end_at` is meaningless unless
 * something actually checks it against a clock with nobody around to
 * trigger it by writing a vote/RSVP — `maybeAutoCloseEvent` only runs
 * reactively on those two writes, same limitation `event-reminders`
 * documents for its own "starting soon" nudge. Deliberately NOT in
 * `vercel.json`: Hobby's cron runs at most once a day, but a deadline
 * needs checking every few minutes to actually fire close to on time.
 * Point an external scheduler (e.g. cron-job.org) at this route every ~5
 * minutes with the same `Authorization: Bearer $CRON_SECRET` header
 * already used for `event-reminders` — the same account, a second job.
 * Without it configured, deadlines are still fully settable but never
 * actually enforced, same "silently does nothing" failure mode already
 * documented for the other cron-dependent features.
 *
 * Two independent things per tick, in this order — sending the "closes
 * soon" nudge before actually closing means a deadline that's already
 * passed by the time this runs still gets closed (the reminder sweep's
 * own window check simply won't match it, which is fine: there's nothing
 * useful left to remind anyone of).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  if (!isAuthorized(request)) {
    return unauthorized("This endpoint requires a valid CRON_SECRET");
  }

  const repo = await getRepoAsync();

  const dueReminders = await repo.listAndClaimVoteDeadlineReminders(
    VOTE_DEADLINE_REMINDER_LOOKAHEAD_MINUTES
  );
  let remindersSent = 0;
  for (const { eventId, title, pendingUserIds } of dueReminders) {
    if (pendingUserIds.length === 0) continue;
    try {
      const { succeededUserIds } = await sendPushToUsers(repo, pendingUserIds, {
        title: "Voting closes soon",
        body: `${title} — cast your vote soon`,
        url: `/events/${eventId}`,
      });
      remindersSent += succeededUserIds.length;
    } catch (error) {
      // Deliberately no unclaim-on-failure here, unlike event-reminders:
      // this is a one-time courtesy nudge on top of a hard deadline the
      // Jio page itself already displays, not the sole mechanism for
      // anything — a missed push here isn't a lost reminder the way a
      // missed "starting soon" push would be.
      console.log(`[cron/vote-deadline] reminder send failed for event ${eventId}:`, error);
    }
  }

  const closed = await repo.closeEventsPastVoteDeadline();

  return json({
    remindersSent,
    remindedEvents: dueReminders.length,
    closed,
  });
}
