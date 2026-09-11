import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterPlaces, type FilterState } from "@/components/FilterBar";
import type { Place } from "@/types";

/**
 * `filterPlaces` mirrors demoRepo's server-side `applyFilters` as a pure
 * client-side predicate, so the same cuisine/budget/walk/search/Foodpanda/
 * Grab filters can also narrow the already-fetched Want to try/Tried/
 * Favourites lists — those never round-trip through the API on a filter
 * change, unlike the plain browse list.
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

function filters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("filterPlaces", () => {
  it("passes everything through when nothing is set", () => {
    const places = [place({ id: "a" }), place({ id: "b" })];
    expect(filterPlaces(places, filters())).toHaveLength(2);
  });

  it("keeps a place matching any one selected cuisine", () => {
    const places = [
      place({ id: "thai", cuisine: ["thai"] }),
      place({ id: "chinese", cuisine: ["chinese"] }),
      place({ id: "both", cuisine: ["thai", "chinese"] }),
    ];
    const result = filterPlaces(places, filters({ cuisines: ["thai"] }));
    expect(result.map((p) => p.id).sort()).toEqual(["both", "thai"]);
  });

  it("excludes anything above the budget cap, no-ops at the top tier", () => {
    const places = [
      place({ id: "cheap", budget_tier: 1 }),
      place({ id: "pricey", budget_tier: 6 }),
    ];
    expect(filterPlaces(places, filters({ budgetMax: 2 })).map((p) => p.id)).toEqual([
      "cheap",
    ]);
    expect(filterPlaces(places, filters({ budgetMax: 6 }))).toHaveLength(2);
  });

  it("only applies the walk-time cap when explicitly asked to", () => {
    const places = [
      place({ id: "near", walk_minutes: 5 }),
      place({ id: "far", walk_minutes: 40 }),
      place({ id: "unknown" }),
    ];
    // Untouched — the default 30 min shouldn't silently hide a saved place
    // that was never walk-filtered to begin with.
    expect(filterPlaces(places, filters({ maxWalk: 30 }))).toHaveLength(3);
    // Touched — now it should actually narrow, same as the "All" tab does.
    const touched = filterPlaces(places, filters({ maxWalk: 30 }), {
      applyMaxWalk: true,
    });
    expect(touched.map((p) => p.id).sort()).toEqual(["near", "unknown"]);
  });

  it("filters by Foodpanda/Grab presence", () => {
    const places = [
      place({ id: "both", foodpanda_url: "x", grab_url: "y" }),
      place({ id: "panda-only", foodpanda_url: "x" }),
      place({ id: "neither" }),
    ];
    expect(
      filterPlaces(places, filters({ hasFoodpanda: true })).map((p) => p.id).sort()
    ).toEqual(["both", "panda-only"]);
    expect(
      filterPlaces(places, filters({ hasGrab: true })).map((p) => p.id)
    ).toEqual(["both"]);
  });

  it("searches name, address, best dishes and cuisine, case-insensitively", () => {
    const places = [
      place({ id: "by-name", name: "Joo Chiat Laksa" }),
      place({ id: "by-dish", best_dishes: ["Otah"] }),
      place({ id: "by-cuisine", cuisine: ["korean"] }),
      place({ id: "no-match", name: "Elsewhere" }),
    ];
    expect(
      filterPlaces(places, filters({ search: "laksa" })).map((p) => p.id)
    ).toEqual(["by-name"]);
    expect(
      filterPlaces(places, filters({ search: "OTAH" })).map((p) => p.id)
    ).toEqual(["by-dish"]);
    expect(
      filterPlaces(places, filters({ search: "korean" })).map((p) => p.id)
    ).toEqual(["by-cuisine"]);
  });
});
