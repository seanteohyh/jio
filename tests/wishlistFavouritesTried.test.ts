import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

// DEMO_TEAMMATE_A/B carry pre-seeded visits and events in demoData.ts, so
// tests that assert a *clean* tried-state use these unseeded ids instead.
const FRESH_USER_A = "00000000-0000-0000-0000-0000000000f1";
const FRESH_USER_B = "00000000-0000-0000-0000-0000000000f2";

/**
 * Places grows two independent personal lists — the existing wishlist
 * ("Want to try"), now with an optional reminder note, and a brand new
 * Favourites — plus a third, never-user-toggled "Tried" tab derived from
 * logged visits and Jios actually attended (RSVP'd yes, or hosted) that
 * were decided at a place.
 */

beforeEach(() => {
  resetDemoStore();
});

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

async function makeEvent(
  inviteeIds: string[] = [],
  hostId: string = DEMO_USER_ID
) {
  return demoRepo.createEvent(
    hostId,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    inviteeIds
  );
}

describe("wishlist notes", () => {
  it("round-trips a reminder note once the place is saved", async () => {
    await demoRepo.toggleWishlist(DEMO_USER_ID, "demo-place-01");
    await demoRepo.updateWishlistNote(
      DEMO_USER_ID,
      "demo-place-01",
      "the laksa"
    );

    const list = await demoRepo.listWishlist(DEMO_USER_ID);
    const entry = list.find((w) => w.place_id === "demo-place-01");
    expect(entry?.note).toBe("the laksa");
  });

  it("can clear a note back to null", async () => {
    await demoRepo.toggleWishlist(DEMO_USER_ID, "demo-place-01");
    await demoRepo.updateWishlistNote(DEMO_USER_ID, "demo-place-01", "a note");
    await demoRepo.updateWishlistNote(DEMO_USER_ID, "demo-place-01", null);

    const list = await demoRepo.listWishlist(DEMO_USER_ID);
    const entry = list.find((w) => w.place_id === "demo-place-01");
    expect(entry?.note).toBeNull();
  });

  it("refuses a note for a place that was never saved", async () => {
    await expect(
      demoRepo.updateWishlistNote(DEMO_USER_ID, "demo-place-01", "a note")
    ).rejects.toThrow(/save/i);
  });
});

describe("favourites", () => {
  it("toggles independently of the wishlist — a place can be both", async () => {
    await demoRepo.toggleWishlist(DEMO_USER_ID, "demo-place-01");
    const liked = await demoRepo.toggleFavourite(DEMO_USER_ID, "demo-place-01");
    expect(liked.added).toBe(true);

    const wishlist = await demoRepo.listWishlist(DEMO_USER_ID);
    const favourites = await demoRepo.listFavourites(DEMO_USER_ID);
    expect(wishlist.map((w) => w.place_id)).toContain("demo-place-01");
    expect(favourites.map((f) => f.place_id)).toContain("demo-place-01");
  });

  it("toggles off on a second call", async () => {
    await demoRepo.toggleFavourite(DEMO_USER_ID, "demo-place-01");
    const result = await demoRepo.toggleFavourite(DEMO_USER_ID, "demo-place-01");
    expect(result.added).toBe(false);
    expect(await demoRepo.listFavourites(DEMO_USER_ID)).toHaveLength(0);
  });

  it("hydrates the joined place record", async () => {
    await demoRepo.toggleFavourite(DEMO_USER_ID, "demo-place-01");
    const [entry] = await demoRepo.listFavourites(DEMO_USER_ID);
    expect(entry.place?.name).toBeTruthy();
  });
});

describe("listTriedPlaceIds / listTried", () => {
  it("includes a place from a logged visit", async () => {
    await demoRepo.createVisit({
      place_id: "demo-place-03",
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: new Date().toISOString(),
      is_public: true,
    });

    const ids = await demoRepo.listTriedPlaceIds(DEMO_USER_ID);
    expect(ids).toContain("demo-place-03");
  });

  it("includes a place from a closed Jio the user hosted", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);
    const closed = await demoRepo.maybeAutoCloseEvent(event.id);
    expect(closed?.winner_place_id).toBeTruthy();

    const ids = await demoRepo.listTriedPlaceIds(DEMO_USER_ID);
    expect(ids).toContain(closed!.winner_place_id);
  });

  it("includes a place from a closed Jio the user attended as a guest (RSVP'd yes)", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "yes");
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_B, ["demo-place-01"]);
    await demoRepo.maybeAutoCloseEvent(event.id);

    const ids = await demoRepo.listTriedPlaceIds(DEMO_TEAMMATE_A);
    expect(ids).toContain("demo-place-01");
  });

  it("excludes a Jio the user was only invited to, without RSVPing yes", async () => {
    const event = await makeEvent([FRESH_USER_A, FRESH_USER_B]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, FRESH_USER_A, "maybe");
    await demoRepo.rsvp(event.id, FRESH_USER_B, "no");
    await demoRepo.maybeAutoCloseEvent(event.id);

    const idsForMaybe = await demoRepo.listTriedPlaceIds(FRESH_USER_A);
    const idsForDeclined = await demoRepo.listTriedPlaceIds(FRESH_USER_B);
    expect(idsForMaybe).not.toContain("demo-place-01");
    expect(idsForDeclined).not.toContain("demo-place-01");
  });

  it("excludes a Jio that never closed", async () => {
    const event = await makeEvent([], FRESH_USER_A);
    await demoRepo.rsvp(event.id, FRESH_USER_A, "yes");

    const ids = await demoRepo.listTriedPlaceIds(FRESH_USER_A);
    expect(ids).not.toContain("demo-place-01");
  });

  it("de-duplicates a place tried via both a visit and a Jio", async () => {
    await demoRepo.createVisit({
      place_id: "demo-place-01",
      user_id: DEMO_USER_ID,
      rating: 5,
      best_dishes: [],
      notes: null,
      visited_at: new Date().toISOString(),
      is_public: true,
    });
    const event = await makeEvent();
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.maybeAutoCloseEvent(event.id);

    const ids = await demoRepo.listTriedPlaceIds(DEMO_USER_ID);
    expect(ids.filter((id) => id === "demo-place-01")).toHaveLength(1);
  });

  it("listTried hydrates the same set into full place records", async () => {
    await demoRepo.createVisit({
      place_id: "demo-place-03",
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: new Date().toISOString(),
      is_public: true,
    });

    const places = await demoRepo.listTried(DEMO_USER_ID);
    expect(places.map((p) => p.id)).toContain("demo-place-03");
    expect(places.find((p) => p.id === "demo-place-03")?.name).toBeTruthy();
  });

  it("returns nothing for an account with no visits or attended Jios", async () => {
    expect(await demoRepo.listTriedPlaceIds(FRESH_USER_B)).toEqual([]);
    expect(await demoRepo.listTried(FRESH_USER_B)).toEqual([]);
  });
});
