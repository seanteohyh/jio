import { describe, expect, it } from "vitest";
import {
  clusterPlaces,
  isHighlyRated,
  isNewListing,
} from "@/lib/mapClusters";
import type { Place } from "@/types";

/**
 * Several places sharing (almost) the same coordinates — every stall in a
 * food court, all geocoded to one building's address — used to stack
 * invisibly under a single map marker; only whichever one happened to
 * render on top was ever clickable. `clusterPlaces` groups them so the map
 * can show one marker with a consolidated list instead. `isHighlyRated`/
 * `isNewListing` are the two new map badges, both non-personalized signals
 * distinct from Places' own "your Kakis" badge and "New to try" rail.
 */
function place(overrides: Partial<Place> & { id: string }): Place {
  return {
    name: overrides.id,
    address: null,
    lat: 1.3,
    lng: 103.85,
    cuisine: [],
    custom_cuisine_tags: [],
    budget_tier: 2,
    osm_id: null,
    source: "manual",
    status: "active",
    best_dishes: [],
    notes: null,
    ...overrides,
  };
}

describe("clusterPlaces", () => {
  it("keeps a lone place as its own single-item group", () => {
    const groups = clusterPlaces([place({ id: "a", lat: 1.3, lng: 103.85 })]);
    expect(groups).toEqual([[expect.objectContaining({ id: "a" })]]);
  });

  it("groups places at the exact same coordinates", () => {
    const groups = clusterPlaces([
      place({ id: "a", lat: 1.3, lng: 103.85 }),
      place({ id: "b", lat: 1.3, lng: 103.85 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("groups places within the same ~11m grid cell despite tiny float drift", () => {
    const groups = clusterPlaces([
      place({ id: "a", lat: 1.30001, lng: 103.85001 }),
      place({ id: "b", lat: 1.30004, lng: 103.85004 }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("keeps places in different buildings apart", () => {
    const groups = clusterPlaces([
      place({ id: "a", lat: 1.3, lng: 103.85 }),
      place({ id: "b", lat: 1.31, lng: 103.86 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("handles an empty list", () => {
    expect(clusterPlaces([])).toEqual([]);
  });
});

describe("isHighlyRated", () => {
  it("is true at or above the threshold with enough visits", () => {
    expect(isHighlyRated(place({ id: "a", avg_rating: 4.5, visit_count: 2 }))).toBe(
      true
    );
    expect(isHighlyRated(place({ id: "a", avg_rating: 4.8, visit_count: 5 }))).toBe(
      true
    );
  });

  it("is false below the threshold", () => {
    expect(isHighlyRated(place({ id: "a", avg_rating: 4.4, visit_count: 5 }))).toBe(
      false
    );
  });

  it("is false for a lone review, even a perfect one", () => {
    expect(isHighlyRated(place({ id: "a", avg_rating: 5, visit_count: 1 }))).toBe(
      false
    );
  });

  it("is false with no rating at all", () => {
    expect(isHighlyRated(place({ id: "a", avg_rating: null, visit_count: 5 }))).toBe(
      false
    );
  });
});

describe("isNewListing", () => {
  const now = new Date("2026-09-11T00:00:00Z").getTime();

  it("is true just inside the window", () => {
    const place13DaysOld = place({
      id: "a",
      created_at: "2026-08-29T00:00:00Z",
    });
    expect(isNewListing(place13DaysOld, now)).toBe(true);
  });

  it("is false once past the window", () => {
    const place30DaysOld = place({
      id: "a",
      created_at: "2026-08-12T00:00:00Z",
    });
    expect(isNewListing(place30DaysOld, now)).toBe(false);
  });

  it("is false with no created_at", () => {
    expect(isNewListing(place({ id: "a" }), now)).toBe(false);
  });
});
