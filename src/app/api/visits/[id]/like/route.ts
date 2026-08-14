import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";
import type { Repo } from "@/lib/data";

type Params = { params: Promise<{ id: string }> };

/**
 * Throttled to at most one push per review per window
 * (048_review_likes.sql), same shape as `notifyHostOfVote` in the vote
 * route. Never fires for liking your own review.
 */
async function notifyOfLike(
  repo: Repo,
  visitId: string,
  visitUserId: string,
  likerId: string,
  likeCount: number
): Promise<void> {
  if (likerId === visitUserId) return;
  try {
    const claimed = await repo.claimReviewLikePushWindow(visitId);
    if (!claimed) return;
    await sendPushToUsers(repo, [visitUserId], {
      title: `${likeCount} ${likeCount === 1 ? "like" : "likes"} on your review`,
      body: "Someone appreciated what you shared.",
      url: "/profile",
    });
  } catch {
    // Logged inside sendPushToUsers already; a like must never fail on this.
  }
}

/**
 * Toggle the caller's like on a review — POST adds it if missing, removes it
 * if present, same "one endpoint, on if off, off if on" shape as
 * `/api/wishlist`'s toggle.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("reviews");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const result = await repo.toggleReviewLike(user.id, id);

    if (result.liked) {
      await notifyOfLike(
        repo,
        id,
        result.visit_user_id,
        user.id,
        result.like_count
      );
    }

    return json({ liked: result.liked, like_count: result.like_count });
  } catch (error) {
    return errorResponse(error);
  }
}
