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

  for (const [eventId, { title, userIds }] of userIdsByEvent) {
    await sendPushToUsers(repo, userIds, {
      title: `Starting soon: ${title}`,
      body: `${title} is starting soon.`,
      url: `/events/${eventId}`,
    });
  }

  return json({ sent: due.length, events: userIdsByEvent.size });
}
