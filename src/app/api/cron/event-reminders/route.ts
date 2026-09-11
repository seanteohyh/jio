import { NextRequest, NextResponse } from "next/server";
import { getRepoAsync } from "@/lib/data/repo";
import { json, unauthorized } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";

/**
 * The "starting soon" reminder scan — CHANGES_20260821c.md §1. Deliberately
 * NOT in `vercel.json`: Hobby's cron runs at most once a day, but a
 * per-person, per-Jio configurable lead time needs to be checked far more
 * often than that to actually fire close to on time. Per the README's
 * documented pattern for anything needing to run more than once a day,
 * this is meant to be hit every few minutes by an external scheduler (e.g.
 * cron-job.org) with the same bearer token Vercel's own crons use.
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
  const due = await repo.listAndClaimDueReminders();

  // Grouped by event since the push content doesn't depend on who's
  // getting it or what their own lead time was — fewer sendPushToUsers
  // calls than one per person, same content either way.
  const userIdsByEvent = new Map<string, { title: string; userIds: string[] }>();
  for (const { eventId, userId, title } of due) {
    const entry = userIdsByEvent.get(eventId);
    if (entry) entry.userIds.push(userId);
    else userIdsByEvent.set(eventId, { title, userIds: [userId] });
  }

  // `listAndClaimDueReminders` already marked every row in `due` as sent —
  // a one-shot claim taken *before* anything is actually attempted, so it
  // can't double-fire across overlapping cron runs. That means a send that
  // never reaches anyone (a transient error fetching push targets, every
  // subscription for that user being dead, VAPID briefly misconfigured)
  // would otherwise permanently lose that reminder with no way to retry.
  // Anyone `sendPushToUsers` didn't actually reach gets un-claimed here, so
  // the next scan picks them back up — one event throwing entirely (rather
  // than just some of its recipients failing) un-claims that whole event's
  // batch instead of aborting the loop and losing every event after it.
  const toUnclaim: Array<{ eventId: string; userId: string }> = [];

  for (const [eventId, { title, userIds }] of userIdsByEvent) {
    try {
      const { succeededUserIds } = await sendPushToUsers(repo, userIds, {
        title: `Starting soon: ${title}`,
        body: `${title} is starting soon.`,
        url: `/events/${eventId}`,
      });
      const succeeded = new Set(succeededUserIds);
      for (const userId of userIds) {
        if (!succeeded.has(userId)) toUnclaim.push({ eventId, userId });
      }
    } catch (error) {
      console.log(`[cron/event-reminders] send failed for event ${eventId}:`, error);
      for (const userId of userIds) toUnclaim.push({ eventId, userId });
    }
  }

  if (toUnclaim.length > 0) {
    await repo.unclaimReminders(toUnclaim);
  }

  return json({
    sent: due.length - toUnclaim.length,
    unclaimed: toUnclaim.length,
    events: userIdsByEvent.size,
  });
}
