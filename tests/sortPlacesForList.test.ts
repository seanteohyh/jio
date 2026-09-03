import { describe, expect, it } from "vitest";
import { sortPlacesForList } from "@/lib/utils";
import type { Place } from "@/types";

/**
 * CHANGES_20260803.md §12e: /places gained a rating sort alongside the
 * existing nearest-first default. Both read stored/cached columns
 * (walk_minutes, avg_rating), so neither needs a visits fetch.
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

describe("sortPlacesForList", () => {
  it("defaults to nearest first", () => {
    const places = [
      place({ id: "far", walk_minutes: 20 }),
      place({ id: "near", walk_minutes: 5 }),
    ];
    expect(sortPlacesForList(places).map((p) => p.id)).toEqual([
      "near",
      "far",
    ]);
  });

  it("sorts by rating descending when asked", () => {
    const places = [
      place({ id: "low", avg_rating: 3, walk_minutes: 1 }),
      place({ id: "high", avg_rating: 4.8, walk_minutes: 20 }),
    ];
    expect(
      sortPlacesForList(places, "rating").map((p) => p.id)
    ).toEqual(["high", "low"]);
  });

  it("sinks unrated places to the bottom of a rating sort, not the top", () => {
    const places = [
      place({ id: "unrated" }),
      place({ id: "rated", avg_rating: 1 }),
    ];
    expect(
      sortPlacesForList(places, "rating").map((p) => p.id)
    ).toEqual(["rated", "unrated"]);
  });

  it("still breaks rating ties by walk time", () => {
    const places = [
      place({ id: "farther", avg_rating: 4, walk_minutes: 15 }),
      place({ id: "closer", avg_rating: 4, walk_minutes: 5 }),
    ];
    expect(
      sortPlacesForList(places, "rating").map((p) => p.id)
    ).toEqual(["closer", "farther"]);
  });

  it("sorts by rating_updated_at descending when asked to show newly rated first", () => {
    const places = [
      place({ id: "old", rating_updated_at: "2026-01-01T00:00:00Z" }),
      place({ id: "fresh", rating_updated_at: "2026-06-01T00:00:00Z" }),
    ];
    expect(
      sortPlacesForList(places, "newly_rated").map((p) => p.id)
    ).toEqual(["fresh", "old"]);
  });

  it("sinks never-rated places to the bottom of a newly-rated sort", () => {
    const places = [
      place({ id: "never-rated" }),
      place({ id: "rated", rating_updated_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(
      sortPlacesForList(places, "newly_rated").map((p) => p.id)
    ).toEqual(["rated", "never-rated"]);
  });

  it("still breaks a newly-rated tie by walk time", () => {
    const places = [
      place({
        id: "farther",
        rating_updated_at: "2026-01-01T00:00:00Z",
        walk_minutes: 15,
      }),
      place({
        id: "closer",
        rating_updated_at: "2026-01-01T00:00:00Z",
        walk_minutes: 5,
      }),
    ];
    expect(
      sortPlacesForList(places, "newly_rated").map((p) => p.id)
    ).toEqual(["closer", "farther"]);
  });
});
