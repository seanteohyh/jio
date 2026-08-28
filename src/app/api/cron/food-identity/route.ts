import { NextRequest, NextResponse } from "next/server";
import { getRepoAsync } from "@/lib/data/repo";
import { json, unauthorized } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";
import { formatMonthKey } from "@/lib/utils";
import {
  computeFoodIdentity,
  computeKakiFoodIdentity,
  previousMonthKey,
} from "@/lib/foodIdentity";
import { computeKakiMetrics, computeUserMetrics } from "@/lib/metrics";
import type { Visit } from "@/types";

/**
 * Monthly food identity cron — CHANGES_20260821_combined2.md Item 1.
 *
 * "Locked snapshot, not always-live" is the entire point: an archetype
 * computed fresh on every page load would flicker mid-month as someone logs
 * new visits. Instead this runs once, early each month, and locks in a card
 * for the month that just ended — reusing `computeUserMetrics`/
 * `computeKakiMetrics`'s ordinary *cumulative* aggregates (not visits
 * filtered to that one month), so "August's card" means "your identity as
 * of the start of August," not "what you specifically ate in August." Once
 * written, a snapshot is never recomputed — the next run inserts a new row
 * for the new month rather than touching this one, which is what keeps
 * prior months browsable.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically, same
 * check as every other cron here.
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
  const blocked = featureGate("metrics");
  if (blocked) return blocked as NextResponse;

  if (!isAuthorized(request)) {
    return unauthorized("This endpoint requires a valid CRON_SECRET");
  }

  const repo = await getRepoAsync();
  const month = previousMonthKey();
  const { places } = await repo.listPlaces({ status: "all" });

  const revealedUsers: string[] = [];
  const userIds = await repo.listAllUserIds();
  for (const userId of userIds) {
    try {
      const visits = await repo.listVisits(undefined, userId);
      const metrics = computeUserMetrics(visits, places);
      const card = computeFoodIdentity(metrics);
      await repo.saveUserFoodIdentitySnapshot(userId, month, card);
      revealedUsers.push(userId);
    } catch {
      // One account's snapshot failing (a transient write error, say)
      // should not stop the rest of the run.
    }
  }

  const revealedKakis: string[] = [];
  const kakiIds = await repo.listAllKakiIds();
  for (const kakiId of kakiIds) {
    try {
      const kaki = await repo.getKaki(kakiId);
      if (!kaki) continue;

      const memberVisits = new Map<string, Visit[]>();
      await Promise.all(
        kaki.members.map(async (member) => {
          memberVisits.set(
            member.user_id,
            await repo.listVisits(undefined, member.user_id)
          );
        })
      );

      const metrics = computeKakiMetrics(memberVisits, places, kaki.members);
      const card = computeKakiFoodIdentity(metrics);
      await repo.saveKakiFoodIdentitySnapshot(kakiId, month, card);
      revealedKakis.push(kakiId);

      await sendPushToUsers(
        repo,
        kaki.members.map((m) => m.user_id),
        {
          title: `${kaki.name}'s ${formatMonthKey(month)} vibe is ready`,
          body: card.headline,
          url: `/kakis/${kakiId}`,
        }
      );
    } catch {
      // Same reasoning as the per-user loop above.
    }
  }

  // One push per user, not folded into the per-account loop above — a
  // failed push for one person should never roll back or skip their own
  // already-saved snapshot, so this runs as a clearly separate pass once
  // every snapshot that could be saved already has been.
  for (const userId of revealedUsers) {
    const snapshots = await repo.listUserFoodIdentitySnapshots(userId);
    const card = snapshots.find((s) => s.month === month);
    if (!card) continue;
    await sendPushToUsers(repo, [userId], {
      title: `Your ${formatMonthKey(month)} food identity is ready`,
      body: `You're ${card.headline}.`,
      url: "/profile",
    });
  }

  return json({
    month,
    users: revealedUsers.length,
    kakis: revealedKakis.length,
  });
}
