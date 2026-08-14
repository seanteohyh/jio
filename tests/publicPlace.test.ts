import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";

/**
 * CHANGES_20260812.md §4 — the public place-preview page. `getPublicPlace`
 * is the one repo method it's allowed to call before a visitor has signed
 * in, so it's the one place a leak of `notes`, `created_by`, an exact pin,
 * or a `needs_review`/`blocked` place would show up.
 */

beforeEach(() => {
  resetDemoStore();
});

async function seedPlace(overrides: Partial<Parameters<typeof demoRepo.createPlace>[0]> = {}) {
  return demoRepo.createPlace({
    name: "Kopitiam Test",
    address: "1 Test Street",
    lat: 1.3,
    lng: 103.85,
    cuisine: ["local"],
    custom_cuisine_tags: ["Zi Char"],
    budget_tier: 2,
    source: "manual",
    status: "active",
    best_dishes: ["kopi"],
    notes: "internal notes nobody outside the team should see",
    created_by: "somebody",
    ...overrides,
  });
}

describe("getPublicPlace", () => {
  it("returns the safe subset of an active place", async () => {
    const place = await seedPlace();

    const pub = await demoRepo.getPublicPlace(place.id);

    expect(pub).toMatchObject({
      id: place.id,
      name: "Kopitiam Test",
      address: "1 Test Street",
      cuisine: ["local"],
      custom_cuisine_tags: ["Zi Char"],
      budget_tier: 2,
      best_dishes: ["kopi"],
    });
  });

  it("never exposes notes or created_by", async () => {
    const place = await seedPlace();

    const pub = await demoRepo.getPublicPlace(place.id);

    expect(pub).not.toHaveProperty("notes");
    expect(pub).not.toHaveProperty("created_by");
  });

  it("carries lat/lng, since places are public venues findable on Google Maps anyway", async () => {
    const place = await seedPlace({ lat: 1.301, lng: 103.851 });

    const pub = await demoRepo.getPublicPlace(place.id);

    expect(pub?.lat).toBe(1.301);
    expect(pub?.lng).toBe(103.851);
  });

  it("hides a place still waiting for review", async () => {
    const place = await seedPlace({ status: "needs_review" });

    expect(await demoRepo.getPublicPlace(place.id)).toBeNull();
  });

  it("hides a blocked place", async () => {
    const place = await seedPlace({ status: "blocked" });

    expect(await demoRepo.getPublicPlace(place.id)).toBeNull();
  });

  it("returns null for a place that does not exist", async () => {
    expect(await demoRepo.getPublicPlace("no-such-place")).toBeNull();
  });

  it("carries the same computed rating and visit count getPlace shows", async () => {
    // avg_rating/visit_count are computed at read time from visits in demo
    // mode (see `enrich`), not stored on the place row — a first pass at
    // this method read the raw row directly and always showed "not rated
    // yet" even for a place with real visits logged.
    const place = await seedPlace();
    await demoRepo.createVisit({
      place_id: place.id,
      user_id: "somebody",
      rating: 5,
      best_dishes: [],
      notes: null,
      visited_at: new Date().toISOString(),
      is_public: true,
    });

    const full = await demoRepo.getPlace(place.id);
    const pub = await demoRepo.getPublicPlace(place.id);

    expect(pub?.avg_rating).toBe(full?.avg_rating);
    expect(pub?.visit_count).toBe(full?.visit_count);
    expect(pub?.visit_count).toBe(1);
  });
});
