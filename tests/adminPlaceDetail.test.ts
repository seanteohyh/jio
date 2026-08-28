import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260821_combined.md Part 1 §C — the Places view's per-place
 * drill-down: visitors, a rating trend over time, wishlist saves, lobang
 * mentions, and cuisine/budget alignment with the people who actually go
 * there. Uses a freshly-created place (not a seeded one) so the assertions
 * can be exact rather than deltas against pre-seeded demo data.
 */

beforeEach(() => {
  resetDemoStore();
});

async function makeTestPlace(cuisine: string[], budgetTier: 1 | 2 | 3 | 4 | 5 | 6) {
  return demoRepo.createPlace({
    name: "Test Kopitiam",
    address: null,
    lat: 1.3,
    lng: 103.8,
    cuisine,
    custom_cuisine_tags: [],
    budget_tier: budgetTier,
    osm_id: null,
    source: "manual",
    status: "active",
    best_dishes: [],
    notes: null,
  });
}

describe("getAdminPlaceDetail", () => {
  it("returns null for a place that does not exist", async () => {
    expect(await demoRepo.getAdminPlaceDetail("no-such-place")).toBeNull();
  });

  it("ranks visitors by visit count", async () => {
    const place = await makeTestPlace(["chinese"], 2);
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_USER_ID,
      rating: 5,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-01",
      is_public: false,
    });
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-08",
      is_public: false,
    });
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_TEAMMATE_A,
      rating: 3,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-02",
      is_public: false,
    });

    const detail = await demoRepo.getAdminPlaceDetail(place.id);
    expect(detail?.visitors).toEqual([
      { id: DEMO_USER_ID, name: "You", count: 2 },
      { id: DEMO_TEAMMATE_A, name: "Alex Tan", count: 1 },
    ]);
  });

  it("buckets the rating trend by Asia/Singapore week", async () => {
    const place = await makeTestPlace(["chinese"], 2);
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-01",
      is_public: false,
    });
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_TEAMMATE_A,
      rating: 2,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-01",
      is_public: false,
    });

    const detail = await demoRepo.getAdminPlaceDetail(place.id);
    // Both visits logged "now" (createVisit stamps created_at at call time),
    // so they collapse into a single week's average of (4+2)/2 = 3.
    expect(detail?.ratingTrend).toHaveLength(1);
    expect(detail?.ratingTrend[0].avgRating).toBe(3);
    expect(detail?.ratingTrend[0].count).toBe(2);
  });

  it("counts wishlist saves and lobang mentions for the place", async () => {
    const place = await makeTestPlace(["chinese"], 2);
    await demoRepo.toggleWishlist(DEMO_USER_ID, place.id);
    await demoRepo.toggleWishlist(DEMO_TEAMMATE_A, place.id);
    await demoRepo.sendLobang(
      DEMO_USER_ID,
      { type: "users", userIds: [DEMO_TEAMMATE_B] },
      place.id,
      null,
      null
    );

    const detail = await demoRepo.getAdminPlaceDetail(place.id);
    expect(detail?.wishlistSaveCount).toBe(2);
    expect(detail?.lobangMentionCount).toBe(1);
  });

  it("computes cuisine and budget alignment against actual visitors' prefs", async () => {
    const place = await makeTestPlace(["chinese"], 2);
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-01",
      is_public: false,
    });
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: DEMO_TEAMMATE_A,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-01",
      is_public: false,
    });

    await demoRepo.upsertUserPrefs({
      user_id: DEMO_USER_ID,
      cuisine_likes: ["chinese"],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 3,
      blocklist: [],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
    });
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_A,
      cuisine_likes: ["japanese"],
      cuisine_dislikes: [],
      budget_min: 4,
      budget_max: 6,
      blocklist: [],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
    });

    const detail = await demoRepo.getAdminPlaceDetail(place.id);
    // Only the host's prefs overlap the place's cuisine ("chinese").
    expect(detail?.cuisineAlignmentPct).toBe(50);
    // Only the host's [1,3] range includes budget_tier 2.
    expect(detail?.budgetAlignmentPct).toBe(50);
  });

  it("returns null alignment percentages when no visitor has recorded prefs", async () => {
    const place = await makeTestPlace(["chinese"], 2);
    // A user with no seeded UserPrefs row at all — unlike the three demo
    // identities, which all come with prefs pre-seeded.
    const strangerId = "11111111-1111-1111-1111-111111111111";
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: strangerId,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: "2026-01-01",
      is_public: false,
    });

    const detail = await demoRepo.getAdminPlaceDetail(place.id);
    expect(detail?.cuisineAlignmentPct).toBeNull();
    expect(detail?.budgetAlignmentPct).toBeNull();
  });
});
