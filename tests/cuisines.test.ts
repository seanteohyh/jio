import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";

/**
 * CHANGES_20260818.md §6 — a custom cuisine can be promoted into the
 * shared, runtime-extensible `cuisines` list instead of staying stuck on
 * one place's `custom_cuisine_tags`. The things worth guarding: normalizing
 * a typed label lands on the same slug convention the original 18 already
 * use, adding an already-existing slug is a no-op rather than a duplicate
 * or an error, only an admin can combine two cuisines together, and a
 * combine actually reaches every place/preference referencing the
 * merged-away slug rather than leaving stragglers behind.
 */

function makePlace(cuisine: string[]) {
  return demoRepo.createPlace({
    name: "Cuisine Test Place",
    address: "1 Test Street",
    lat: 1.3,
    lng: 103.85,
    cuisine,
    custom_cuisine_tags: [],
    budget_tier: 2,
    osm_id: null,
    source: "manual",
    status: "active",
    best_dishes: [],
    notes: null,
    created_by: DEMO_USER_ID,
  });
}

beforeEach(() => {
  resetDemoStore();
});

describe("listCuisines", () => {
  it("starts with the original 18, alphabetical by label", async () => {
    const cuisines = await demoRepo.listCuisines();
    expect(cuisines.length).toBe(18);
    expect(cuisines.some((c) => c.slug === "chinese")).toBe(true);
    const labels = cuisines.map((c) => c.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("addCuisine", () => {
  it("normalizes a typed label into a lowercase, underscore-separated slug", async () => {
    const created = await demoRepo.addCuisine(DEMO_TEAMMATE_A, "Korean BBQ");
    expect(created.slug).toBe("korean_bbq");
    expect(created.label).toBe("Korean BBQ");
    expect(created.added_by).toBe(DEMO_TEAMMATE_A);

    const cuisines = await demoRepo.listCuisines();
    expect(cuisines.some((c) => c.slug === "korean_bbq")).toBe(true);
  });

  it("is idempotent on an exact slug collision rather than duplicating", async () => {
    await demoRepo.addCuisine(DEMO_TEAMMATE_A, "Peranakan");
    const second = await demoRepo.addCuisine(DEMO_USER_ID, "peranakan ");

    expect(second.added_by).toBe(DEMO_TEAMMATE_A); // the original wins
    const matches = (await demoRepo.listCuisines()).filter(
      (c) => c.slug === "peranakan"
    );
    expect(matches.length).toBe(1);
  });

  it("refuses a blank label", async () => {
    await expect(demoRepo.addCuisine(DEMO_USER_ID, "   ")).rejects.toThrow();
  });
});

describe("previewCuisineMerge / mergeCuisines", () => {
  it("counts places and preferences referencing a candidate slug", async () => {
    await demoRepo.addCuisine(DEMO_USER_ID, "Peranakan");
    await makePlace(["peranakan", "local"]);
    await makePlace(["peranakan"]);
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_A,
      cuisine_likes: ["peranakan"],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
    });

    const [preview] = await demoRepo.previewCuisineMerge(["peranakan"]);
    expect(preview.place_count).toBe(2);
    expect(preview.profile_count).toBe(1);
  });

  it("refuses a merge from a non-admin", async () => {
    await expect(
      demoRepo.mergeCuisines(DEMO_TEAMMATE_A, "chinese", "japanese")
    ).rejects.toThrow(/admin/i);
  });

  it("refuses merging a cuisine into itself", async () => {
    await expect(
      demoRepo.mergeCuisines(DEMO_USER_ID, "chinese", "chinese")
    ).rejects.toThrow(/itself/i);
  });

  it("folds every reference over, deduping, then retires the merged-away slug", async () => {
    await demoRepo.addCuisine(DEMO_USER_ID, "Korean BBQ");
    // Already has "korean" too — the merge must dedupe, not produce
    // ["korean", "korean"].
    const withBoth = await makePlace(["korean_bbq", "korean"]);
    const withOnlyNew = await makePlace(["korean_bbq"]);
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_A,
      cuisine_likes: ["korean_bbq"],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
    });

    await demoRepo.mergeCuisines(DEMO_USER_ID, "korean", "korean_bbq");

    const places = await demoRepo.listPlaces({});
    const merged1 = places.places.find((p) => p.id === withBoth.id)!;
    const merged2 = places.places.find((p) => p.id === withOnlyNew.id)!;
    expect(merged1.cuisine).toEqual(["korean"]);
    expect(merged2.cuisine).toEqual(["korean"]);

    const prefs = await demoRepo.getUserPrefs(DEMO_TEAMMATE_A);
    expect(prefs?.cuisine_likes).toEqual(["korean"]);

    const cuisines = await demoRepo.listCuisines();
    expect(cuisines.some((c) => c.slug === "korean_bbq")).toBe(false);
  });
});
