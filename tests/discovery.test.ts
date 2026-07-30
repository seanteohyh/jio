import { describe, expect, it } from "vitest";
import {
  budgetByAmenity,
  buildOverpassQuery,
  dedupePlaces,
  normalizeCuisine,
  normalizeElement,
} from "@/lib/discovery";
import { DEDUPE_PROXIMITY_M } from "@/lib/constants";
import type { OverpassElement, PlaceCandidate } from "@/types";

function candidate(
  overrides: Partial<PlaceCandidate> & { osm_id: number }
): PlaceCandidate {
  return {
    name: "Somewhere",
    lat: 1.3,
    lng: 103.85,
    cuisine: ["other"],
    budget_tier: 3,
    source: "discovery",
    status: "needs_review",
    address: null,
    ...overrides,
  };
}

describe("buildOverpassQuery", () => {
  it("asks for the four food amenity types within the radius", () => {
    const query = buildOverpassQuery(1.2966, 103.852, 1200);

    expect(query).toContain("restaurant");
    expect(query).toContain("cafe");
    expect(query).toContain("fast_food");
    expect(query).toContain("food_court");
    expect(query).toContain("around:1200,1.2966,103.852");
    // 'out center' is what gives way elements usable coordinates.
    expect(query).toContain("out center");
  });
});

describe("normalizeCuisine", () => {
  it("passes a known cuisine straight through", () => {
    expect(normalizeCuisine("japanese")).toEqual(["japanese"]);
  });

  it("maps aliases onto our vocabulary", () => {
    expect(normalizeCuisine("burger")).toEqual(["fast_food"]);
    expect(normalizeCuisine("pizza")).toEqual(["fast_food"]);
    expect(normalizeCuisine("noodle")).toEqual(["local"]);
    expect(normalizeCuisine("sushi")).toEqual(["japanese"]);
  });

  it("splits a semicolon-separated list", () => {
    const result = normalizeCuisine("japanese;korean");

    expect(result).toContain("japanese");
    expect(result).toContain("korean");
  });

  it("falls back to 'other' for something unrecognised", () => {
    expect(normalizeCuisine("molecular_gastronomy")).toEqual(["other"]);
  });

  it("falls back to 'other' when the tag is missing", () => {
    expect(normalizeCuisine(undefined)).toEqual(["other"]);
  });
});

describe("budgetByAmenity", () => {
  it("treats hawker-style amenities as cheapest", () => {
    expect(budgetByAmenity("food_court")).toBe(1);
    expect(budgetByAmenity("fast_food")).toBe(1);
  });

  it("puts cafes one tier up", () => {
    expect(budgetByAmenity("cafe")).toBe(2);
  });

  it("defaults a restaurant to the middle tier", () => {
    expect(budgetByAmenity("restaurant")).toBe(3);
    expect(budgetByAmenity(undefined)).toBe(3);
  });
});

describe("normalizeElement", () => {
  it("converts a tagged node into a candidate", () => {
    const element: OverpassElement = {
      type: "node",
      id: 123,
      lat: 1.3,
      lon: 103.85,
      tags: { name: "Kok Sen", amenity: "restaurant", cuisine: "chinese" },
    };

    const result = normalizeElement(element);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Kok Sen");
    expect(result?.cuisine).toEqual(["chinese"]);
    expect(result?.budget_tier).toBe(3);
    expect(result?.status).toBe("needs_review");
  });

  it("skips an element with no name", () => {
    expect(
      normalizeElement({
        type: "node",
        id: 1,
        lat: 1.3,
        lon: 103.85,
        tags: { amenity: "cafe" },
      })
    ).toBeNull();
  });

  it("skips an element with no coordinates", () => {
    expect(
      normalizeElement({ type: "node", id: 1, tags: { name: "Ghost Cafe" } })
    ).toBeNull();
  });

  it("reads a way's coordinates from its center", () => {
    const result = normalizeElement({
      type: "way",
      id: 99,
      center: { lat: 1.31, lon: 103.86 },
      tags: { name: "Big Building Cafe", amenity: "cafe" },
    });

    expect(result?.lat).toBe(1.31);
    expect(result?.lng).toBe(103.86);
  });

  it("assembles an address from the addr:* tags", () => {
    const result = normalizeElement({
      type: "node",
      id: 5,
      lat: 1.3,
      lon: 103.85,
      tags: {
        name: "Somewhere",
        "addr:housenumber": "51",
        "addr:street": "Bras Basah Road",
        "addr:postcode": "189554",
      },
    });

    expect(result?.address).toBe("51 Bras Basah Road 189554");
  });
});

describe("dedupePlaces", () => {
  it("drops a candidate whose osm_id we already hold", () => {
    const result = dedupePlaces(
      [candidate({ osm_id: 1, name: "A" })],
      [{ name: "Different name", lat: 5, lng: 5, osm_id: 1 }]
    );

    expect(result).toHaveLength(0);
  });

  it("drops a same-named candidate at nearly the same spot", () => {
    // Added by hand before OSM knew about it — same place, no osm_id match.
    const result = dedupePlaces(
      [candidate({ osm_id: 1, name: "Zam Zam", lat: 1.302, lng: 103.8567 })],
      [{ name: "zam zam", lat: 1.302, lng: 103.8567, osm_id: null }]
    );

    expect(result).toHaveLength(0);
  });

  it("keeps a same-named place that is genuinely elsewhere", () => {
    // Chains exist. A second branch a kilometre away is a different place.
    const result = dedupePlaces(
      [candidate({ osm_id: 1, name: "Ya Kun", lat: 1.31, lng: 103.86 })],
      [{ name: "Ya Kun", lat: 1.28, lng: 103.84, osm_id: null }]
    );

    expect(result).toHaveLength(1);
  });

  it("keeps a nearby place with a different name", () => {
    const result = dedupePlaces(
      [candidate({ osm_id: 1, name: "New Stall", lat: 1.3, lng: 103.85 })],
      [{ name: "Old Stall", lat: 1.3, lng: 103.85, osm_id: null }]
    );

    expect(result).toHaveLength(1);
  });

  it("de-duplicates within the incoming batch", () => {
    const result = dedupePlaces(
      [
        candidate({ osm_id: 7, name: "Twice" }),
        candidate({ osm_id: 7, name: "Twice" }),
      ],
      []
    );

    expect(result).toHaveLength(1);
  });

  it("uses a proximity radius small enough not to merge neighbours", () => {
    // 25m is about one shopfront. Any larger and adjacent hawker stalls with
    // similar names would start collapsing into each other.
    expect(DEDUPE_PROXIMITY_M).toBeGreaterThan(0);
    expect(DEDUPE_PROXIMITY_M).toBeLessThanOrEqual(50);
  });

  it("returns everything when there is nothing to compare against", () => {
    const result = dedupePlaces(
      [candidate({ osm_id: 1 }), candidate({ osm_id: 2 })],
      []
    );

    expect(result).toHaveLength(2);
  });
});
