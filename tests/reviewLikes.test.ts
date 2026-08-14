import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260814.md §3 — likes on reviews. Trigger-maintained `like_count`
 * (mirrored in demoRepo by `recomputeReviewLikeCount`), toggle semantics
 * matching `toggleWishlist`, and the throttle window backing the
 * like-triggered push (same shape as `claimVotePushWindow`).
 */

const OTHER_USER = DEMO_TEAMMATE_A;

async function seedVisit() {
  return demoRepo.createVisit({
    place_id: "demo-place-01",
    user_id: DEMO_USER_ID,
    rating: 5,
    best_dishes: [],
    notes: null,
    visited_at: new Date().toISOString(),
    is_public: true,
  });
}

beforeEach(() => {
  resetDemoStore();
});

describe("toggleReviewLike", () => {
  it("likes on the first call, unlikes on the second", async () => {
    const visit = await seedVisit();

    const liked = await demoRepo.toggleReviewLike(OTHER_USER, visit.id);
    expect(liked).toMatchObject({
      liked: true,
      like_count: 1,
      visit_user_id: DEMO_USER_ID,
    });

    const unliked = await demoRepo.toggleReviewLike(OTHER_USER, visit.id);
    expect(unliked).toMatchObject({
      liked: false,
      like_count: 0,
      visit_user_id: DEMO_USER_ID,
    });
  });

  it("counts likes from multiple people independently", async () => {
    const visit = await seedVisit();

    await demoRepo.toggleReviewLike(OTHER_USER, visit.id);
    const second = await demoRepo.toggleReviewLike(DEMO_TEAMMATE_B, visit.id);

    expect(second.like_count).toBe(2);
  });

  it("throws for a review that does not exist", async () => {
    await expect(
      demoRepo.toggleReviewLike(OTHER_USER, "no-such-visit")
    ).rejects.toThrow();
  });
});

describe("listPublicReviews liked_by_me", () => {
  it("is undefined with no viewer, true/false once one is given", async () => {
    const visit = await seedVisit();
    await demoRepo.toggleReviewLike(OTHER_USER, visit.id);

    const anonymous = await demoRepo.listPublicReviews("demo-place-01");
    expect(anonymous.find((r) => r.id === visit.id)?.liked_by_me).toBeUndefined();

    const asLiker = await demoRepo.listPublicReviews("demo-place-01", OTHER_USER);
    expect(asLiker.find((r) => r.id === visit.id)?.liked_by_me).toBe(true);

    const asStranger = await demoRepo.listPublicReviews(
      "demo-place-01",
      DEMO_TEAMMATE_B
    );
    expect(asStranger.find((r) => r.id === visit.id)?.liked_by_me).toBe(false);
  });
});

describe("claimReviewLikePushWindow", () => {
  it("claims once, then refuses within the window", async () => {
    const visit = await seedVisit();

    expect(await demoRepo.claimReviewLikePushWindow(visit.id, 600)).toBe(true);
    expect(await demoRepo.claimReviewLikePushWindow(visit.id, 600)).toBe(false);
  });

  it("claims again once the window has passed", async () => {
    const visit = await seedVisit();
    vi.useFakeTimers();
    try {
      expect(await demoRepo.claimReviewLikePushWindow(visit.id, 1)).toBe(true);
      vi.advanceTimersByTime(1500);
      expect(await demoRepo.claimReviewLikePushWindow(visit.id, 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns false for a review that does not exist", async () => {
    expect(await demoRepo.claimReviewLikePushWindow("no-such-visit")).toBe(
      false
    );
  });
});

describe("listReviewLikesSince", () => {
  it("returns only likes at or after the cutoff, with the reviewer attached", async () => {
    const visit = await seedVisit();
    await demoRepo.toggleReviewLike(OTHER_USER, visit.id);

    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(await demoRepo.listReviewLikesSince(future)).toHaveLength(0);

    const recent = await demoRepo.listReviewLikesSince(past);
    expect(recent).toEqual([
      expect.objectContaining({
        visit_id: visit.id,
        visit_user_id: DEMO_USER_ID,
      }),
    ]);
  });
});
