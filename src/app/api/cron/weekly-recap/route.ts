import { NextRequest, NextResponse } from "next/server";
import { getRepoAsync } from "@/lib/data/repo";
import { json, unauthorized } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";
import { sgtWeekKey } from "@/lib/adminAnalytics";

/**
 * Weekly recap push (CHANGES_20260814.md §3) — "Your reviews got N likes
 * this week," sent only to contributors who actually received at least one
 * like that week. A second cron job on Hobby is fine: the old per-project
 * job-count cap is gone, each job is still capped at once a day, and a
 * weekly job comfortably fits under that.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically, same
 * check as `/api/cron/discover`.
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
  const blocked = featureGate("reviews");
  if (blocked) return blocked as NextResponse;

  if (!isAuthorized(request)) {
    return unauthorized("This endpoint requires a valid CRON_SECRET");
  }

  const repo = await getRepoAsync();

  // A week is at most 7 days; 8 gives a little slack for the ±59 minute
  // imprecision Vercel documents for cron timing, without pulling in an
  // extra week's worth of rows to filter back out.
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const likes = await repo.listReviewLikesSince(since);

  const currentWeek = sgtWeekKey(new Date().toISOString());
  const counts = new Map<string, number>();
  for (const like of likes) {
    if (sgtWeekKey(like.created_at) !== currentWeek) continue;
    counts.set(like.visit_user_id, (counts.get(like.visit_user_id) ?? 0) + 1);
  }

  for (const [userId, count] of counts) {
    await sendPushToUsers(repo, [userId], {
      title: `${count} ${count === 1 ? "like" : "likes"} this week`,
      body: "Your reviews got some love this week — take a look.",
      url: "/profile",
    });
  }

  return json({
    week: currentWeek,
    recipients: counts.size,
    totalLikes: Array.from(counts.values()).reduce((a, b) => a + b, 0),
  });
}
