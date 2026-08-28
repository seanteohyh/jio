import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";
import {
  computeCuisineStreak,
  computeKakiMetrics,
  computeUserMetrics,
} from "@/lib/metrics";
import type { Visit } from "@/types";

export async function GET(request: NextRequest) {
  const blocked = featureGate("metrics");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const kakiId = request.nextUrl.searchParams.get("kakiId");

    const [visits, { places }] = await Promise.all([
      repo.listVisits(undefined, user.id),
      repo.listPlaces({ status: "all" }),
    ]);

    const userMetrics = computeUserMetrics(visits, places);
    const streak = computeCuisineStreak(visits, places);
    // CHANGES_20260821_combined2.md Item 1 — the latest locked monthly
    // snapshot, not a live computation: see the cron for why. `null` until
    // the cron has run at least once for this account.
    const foodIdentityHistory = await repo.listUserFoodIdentitySnapshots(
      user.id
    );
    const foodIdentity = foodIdentityHistory[0] ?? null;

    if (!kakiId) {
      return json({
        user: userMetrics,
        streak,
        kaki: null,
        foodIdentity,
        foodIdentityHistory,
      });
    }

    const kaki = await repo.getKaki(kakiId);
    if (!kaki) {
      return json({
        user: userMetrics,
        streak,
        kaki: null,
        foodIdentity,
        foodIdentityHistory,
        kakiFoodIdentity: null,
      });
    }

    const memberVisits = new Map<string, Visit[]>();
    await Promise.all(
      kaki.members.map(async (member) => {
        memberVisits.set(
          member.user_id,
          await repo.listVisits(undefined, member.user_id)
        );
      })
    );

    const kakiFoodIdentityHistory = await repo.listKakiFoodIdentitySnapshots(
      kakiId
    );

    return json({
      user: userMetrics,
      streak,
      kaki: computeKakiMetrics(memberVisits, places, kaki.members),
      foodIdentity,
      foodIdentityHistory,
      kakiFoodIdentity: kakiFoodIdentityHistory[0] ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
