import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, notFound, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { computeKakiMetrics, selectFreshReviews } from "@/lib/metrics";
import {
  resolveKakiAwardCrown,
  type CrownedAward,
  type OtherKakiStanding,
} from "@/lib/kakiCrown";
import type { KakiDetail, KakiMetrics, Place, Visit } from "@/types";

type Params = { params: Promise<{ id: string }> };

type AwardKind = "mostActive" | "adventurer" | "trailblazer";

const RANKING_FIELD: Record<AwardKind, keyof KakiMetrics> = {
  mostActive: "activeRanking",
  adventurer: "adventurerRanking",
  trailblazer: "trailblazerRanking",
};

/** Each `KakiMetrics` ranking array uses a different field name for its raw
 *  stat (`visits`/`distinctPlaces`/`uniquePlaces`) — this reads whichever
 *  one applies and maps every ranking onto the common {user_id, value}
 *  shape `resolveKakiAwardCrown` expects. */
function toGenericRanking(
  rows: { user_id: string; visits?: number; distinctPlaces?: number; uniquePlaces?: number }[]
): { user_id: string; value: number }[] {
  return rows.map((r) => ({
    user_id: r.user_id,
    value: r.visits ?? r.distinctPlaces ?? r.uniquePlaces ?? 0,
  }));
}

/**
 * Log 6 Part B — the home-kaki crown rule. Deliberately stateless (see
 * `resolveKakiAwardCrown`'s own doc comment): resolved fresh on every page
 * load from live per-group rankings, never persisted, so a streak breaking
 * or starting takes effect immediately with no cooldown. For the winner of
 * each award in this kaki, this fetches every OTHER kaki they belong to and
 * recomputes each one's own live ranking for the same award, to check
 * whether they're #1 there too — the one piece of real new cross-group I/O
 * this rule needs (the log's own §"Part B" flags this as the scope-costly
 * part; the exact strategy, this function, is left to engineering
 * judgment, the output contract in the log's rule table is not).
 */
async function resolveCrowns(
  repo: Awaited<ReturnType<typeof getRepoAsync>>,
  kaki: KakiDetail,
  metrics: KakiMetrics,
  places: Place[]
): Promise<Record<AwardKind, CrownedAward | null>> {
  const kinds: AwardKind[] = ["mostActive", "adventurer", "trailblazer"];
  const result: Record<AwardKind, CrownedAward | null> = {
    mostActive: null,
    adventurer: null,
    trailblazer: null,
  };

  for (const kind of kinds) {
    const ranking = toGenericRanking(
      metrics[RANKING_FIELD[kind]] as { user_id: string }[]
    );
    if (ranking.length === 0) continue;

    const winnerId = ranking[0].user_id;
    const otherKakis = (await repo.listKakis(winnerId)).filter(
      (k) => k.id !== kaki.id
    );

    const winnerElsewhere: OtherKakiStanding[] = [];
    for (const otherKaki of otherKakis) {
      const otherDetail = await repo.getKaki(otherKaki.id);
      if (!otherDetail) continue;

      const otherMemberVisits = new Map<string, Visit[]>();
      await Promise.all(
        otherDetail.members.map(async (member) => {
          const visits = await repo.listVisits(undefined, member.user_id);
          otherMemberVisits.set(member.user_id, visits);
        })
      );
      const otherMetrics = computeKakiMetrics(
        otherMemberVisits,
        places,
        otherDetail.members
      );
      const otherRanking = toGenericRanking(
        otherMetrics[RANKING_FIELD[kind]] as { user_id: string }[]
      );
      if (otherRanking[0]?.user_id === winnerId) {
        winnerElsewhere.push({
          kakiId: otherKaki.id,
          kakiName: otherKaki.name,
          createdAt: otherKaki.created_at ?? "",
          value: otherRanking[0].value,
        });
      }
    }

    result[kind] = resolveKakiAwardCrown(
      kaki.id,
      kaki.created_at ?? "",
      ranking,
      winnerElsewhere
    );
  }

  return result;
}

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

    // Log 6 Part B — only worth resolving once this group actually has a
    // card to show; skips the extra cross-kaki work entirely for a group
    // that hasn't had its first monthly snapshot yet.
    const crowns = foodIdentity
      ? await resolveCrowns(repo, kaki, metrics, places)
      : { mostActive: null, adventurer: null, trailblazer: null };

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
      crowns,
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

export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const body = await readJson<{ name?: string }>(request);

    const name = body?.name?.trim();
    if (!name) return badRequest("Give the group a name");
    if (name.length > 60) return badRequest("That name is a bit long");

    const kaki = await repo.renameKaki(id, user.id, name);
    return json({ kaki });
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
