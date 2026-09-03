import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, notFound } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { computeKakiMetrics, selectFreshReviews } from "@/lib/metrics";
import type { Visit } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const kaki = await repo.getKaki(id);
    if (!kaki) return notFound("That group does not exist");

    const { places } = await repo.listPlaces({ status: "all" });

    // Only public visits are readable across users under RLS, so group stats
    // are built from what members chose to share plus your own history.
    const memberVisits = new Map<string, Visit[]>();
    await Promise.all(
      kaki.members.map(async (member) => {
        const visits = await repo.listVisits(undefined, member.user_id);
        memberVisits.set(member.user_id, visits);
      })
    );

    const metrics = computeKakiMetrics(memberVisits, places, kaki.members);

    // CHANGES_20260821_combined2.md Item 1 — the latest locked monthly
    // snapshot, not a live computation off `metrics` above: see the cron
    // for why. `null` until the cron has run at least once for this group.
    const foodIdentityHistory = await repo.listKakiFoodIdentitySnapshots(id);
    const foodIdentity = foodIdentityHistory[0] ?? null;

    // The group's "fresh reviews" feed. `memberVisits` already excludes
    // what RLS wouldn't let this caller see for anyone but themself, same
    // as `metrics` above; `selectFreshReviews` filters that down to
    // `is_public` explicitly rather than trusting RLS alone, since a
    // single review's content is a bigger leak than an aggregate number
    // if that ever drifts.
    const freshReviews = selectFreshReviews(memberVisits);

    // `liked_by_me` isn't part of `listVisits`'s own hydration (only
    // `listPublicReviews` populates it, per-place) — fetched here for just
    // the handful of places these 3 reviews span.
    const freshReviewPlaceIds = Array.from(
      new Set(freshReviews.map((v) => v.place_id))
    );
    const likedVisitIds = new Set<string>();
    await Promise.all(
      freshReviewPlaceIds.map(async (placeId) => {
        const reviews = await repo.listPublicReviews(placeId, user.id);
        for (const r of reviews) {
          if (r.liked_by_me) likedVisitIds.add(r.id);
        }
      })
    );
    const freshReviewsWithLikes = freshReviews.map((v) => ({
      ...v,
      liked_by_me: likedVisitIds.has(v.id),
    }));

    return json({
      kaki,
      metrics,
      foodIdentity,
      foodIdentityHistory,
      freshReviews: freshReviewsWithLikes,
      viewer: {
        id: user.id,
        isMember: kaki.members.some((m) => m.user_id === user.id),
        isCreator: kaki.created_by === user.id,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.leaveKaki(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
