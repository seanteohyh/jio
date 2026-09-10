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

  // Bulk, service-role reads (see the three `*ForCron` methods' own doc
  // comments in `lib/data/index.ts`) — a Vercel Cron invocation has no
  // user session, so the ordinary per-request `listPlaces`/`listVisits`/
  // `getKaki` this route used to call are gated `authenticated`-only by
  // RLS and silently returned nothing to it.
  const places = await repo.listAllPlacesForCron();
  const allVisits = await repo.listAllVisitsForCron();
  const visitsByUser = new Map<string, Visit[]>();
  for (const visit of allVisits) {
    const list = visitsByUser.get(visit.user_id) ?? [];
    list.push(visit);
    visitsByUser.set(visit.user_id, list);
  }

  // Taste preferences, keyed by account — compared against what someone
  // actually ate (see `computeFoodIdentity`'s `prefs` param) to note when
  // behaviour lines up with, or defies, what they said they like/dislike
  // on Profile. Purely additive: an account with neither set (most of
  // them) gets no note at all, same archetype either way.
  const allPrefs = await repo.listAllUserPrefsForCron();
  const prefsByUser = new Map(allPrefs.map((p) => [p.user_id, p]));

  const revealedUsers: string[] = [];
  const userIds = await repo.listAllUserIds();
  for (const userId of userIds) {
    try {
      const visits = visitsByUser.get(userId) ?? [];
      const metrics = computeUserMetrics(visits, places);
      const prefs = prefsByUser.get(userId);
      const card = computeFoodIdentity(
        metrics,
        prefs && {
          likes: prefs.cuisine_likes,
          dislikes: prefs.cuisine_dislikes,
        }
      );
      await repo.saveUserFoodIdentitySnapshot(userId, month, card);
      revealedUsers.push(userId);
    } catch {
      // One account's snapshot failing (a transient write error, say)
      // should not stop the rest of the run.
    }
  }

  const revealedKakis: string[] = [];
  const kakis = await repo.listAllKakisForCron();
  for (const kaki of kakis) {
    try {
      const memberVisits = new Map<string, Visit[]>();
      for (const memberId of kaki.memberIds) {
        memberVisits.set(memberId, visitsByUser.get(memberId) ?? []);
      }
      const members = kaki.memberIds.map((user_id) => ({
        kaki_id: kaki.id,
        user_id,
      }));

      const metrics = computeKakiMetrics(memberVisits, places, members);
      const card = computeKakiFoodIdentity(metrics);
      await repo.saveKakiFoodIdentitySnapshot(kaki.id, month, card);
      revealedKakis.push(kaki.id);

      await sendPushToUsers(repo, kaki.memberIds, {
        title: `${kaki.name}'s ${formatMonthKey(month)} vibe is ready`,
        body: card.headline,
        url: `/kakis/${kaki.id}`,
      });
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
