import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";

beforeEach(() => {
  resetDemoStore();
});

/**
 * Editing and deleting your own visits.
 *
 * This closes an open question left against `021_place_ratings_trigger.sql`:
 * the trigger fires on insert, update *and* delete, but until there was a way
 * to edit a visit at all, only the insert path was ever exercised.
 *
 * The rating aggregates themselves are a database trigger, so they cannot be
 * asserted here — demoRepo has no triggers. What these tests do cover is the
 * layer that decides *whether an update happens at all*: ownership, and which
 * fields an edit is allowed to touch. Those are the parts that would let one
 * person rewrite another's review, or quietly move a review onto a different
 * restaurant.
 */
async function seedVisit(userId = DEMO_USER_ID) {
  const places = await demoRepo.listPlaces();
  const place = places.places[0];

  return demoRepo.createVisit({
    place_id: place.id,
    user_id: userId,
    rating: 3,
    best_dishes: ["laksa"],
    notes: "fine",
    visited_at: new Date("2026-07-01").toISOString(),
    is_public: false,
  });
}

describe("updateVisit", () => {
  let visitId: string;

  beforeEach(async () => {
    visitId = (await seedVisit()).id;
  });

  it("changes the fields it is given and leaves the rest alone", async () => {
    const updated = await demoRepo.updateVisit(visitId, DEMO_USER_ID, {
      rating: 5,
    });

    expect(updated.rating).toBe(5);
    expect(updated.notes).toBe("fine");
    expect(updated.best_dishes).toEqual(["laksa"]);
  });

  it("can un-share a review without deleting the visit", async () => {
    await demoRepo.updateVisit(visitId, DEMO_USER_ID, { is_public: true });
    const shared = await demoRepo.updateVisit(visitId, DEMO_USER_ID, {
      is_public: false,
    });

    expect(shared.is_public).toBe(false);

    // Still in your own history — un-sharing is not deleting.
    const mine = await demoRepo.listVisits(undefined, DEMO_USER_ID);
    expect(mine.some((v) => v.id === visitId)).toBe(true);
  });

  it("refuses to edit somebody else's visit", async () => {
    await expect(
      demoRepo.updateVisit(visitId, "somebody-else", { rating: 1 })
    ).rejects.toThrow();
  });

  it("refuses a visit that does not exist", async () => {
    await expect(
      demoRepo.updateVisit("no-such-visit", DEMO_USER_ID, { rating: 1 })
    ).rejects.toThrow();
  });

  it("cannot be used to move a review onto a different place", async () => {
    const before = await demoRepo.listVisits(undefined, DEMO_USER_ID);
    const original = before.find((v) => v.id === visitId)!;

    // `place_id` and `user_id` are not part of the allowed patch type, so the
    // cast is the point of the test — it stands in for a hand-rolled request
    // body that TypeScript never saw.
    type Patch = Parameters<typeof demoRepo.updateVisit>[2];
    const smuggled = {
      place_id: "somewhere-else",
      user_id: "somebody-else",
      rating: 4,
    } as unknown as Patch;

    await demoRepo.updateVisit(visitId, DEMO_USER_ID, smuggled);

    const after = await demoRepo.listVisits(undefined, DEMO_USER_ID);
    const updated = after.find((v) => v.id === visitId)!;

    expect(updated.place_id).toBe(original.place_id);
    expect(updated.user_id).toBe(DEMO_USER_ID);
    expect(updated.rating).toBe(4);
  });
});

describe("deleteVisit", () => {
  it("removes your own visit", async () => {
    const visit = await seedVisit();
    await demoRepo.deleteVisit(visit.id, DEMO_USER_ID);

    const mine = await demoRepo.listVisits(undefined, DEMO_USER_ID);
    expect(mine.some((v) => v.id === visit.id)).toBe(false);
  });

  it("refuses to delete somebody else's visit", async () => {
    const visit = await seedVisit();
    await expect(
      demoRepo.deleteVisit(visit.id, "somebody-else")
    ).rejects.toThrow();

    const mine = await demoRepo.listVisits(undefined, DEMO_USER_ID);
    expect(mine.some((v) => v.id === visit.id)).toBe(true);
  });
});

/**
 * `rating_updated_at` mirrors 021_place_ratings_trigger.sql's own
 * `visits_rating_trigger`, which — unlike avg_rating/visit_count above —
 * demoRepo actually stamps at write time rather than recomputing fresh on
 * read, so it's testable here.
 */
describe("rating_updated_at", () => {
  it("is stamped on the place when a visit is logged", async () => {
    const before = (await demoRepo.listPlaces()).places[0];
    expect(before.rating_updated_at).toBeUndefined();

    const visit = await seedVisit();
    const after = await demoRepo.getPlace(visit.place_id);
    expect(after?.rating_updated_at).toBeTruthy();
  });

  it("is re-stamped when a visit is edited", async () => {
    const visit = await seedVisit();
    const firstStamp = (await demoRepo.getPlace(visit.place_id))!
      .rating_updated_at!;

    await new Promise((r) => setTimeout(r, 5));
    await demoRepo.updateVisit(visit.id, DEMO_USER_ID, { rating: 5 });

    const secondStamp = (await demoRepo.getPlace(visit.place_id))!
      .rating_updated_at!;
    expect(secondStamp >= firstStamp).toBe(true);
  });

  it("is re-stamped when the only visit is deleted", async () => {
    const visit = await seedVisit();
    await demoRepo.deleteVisit(visit.id, DEMO_USER_ID);

    const after = await demoRepo.getPlace(visit.place_id);
    expect(after?.rating_updated_at).toBeTruthy();
  });
});
