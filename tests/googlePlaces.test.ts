import { describe, expect, it } from "vitest";
import { googleMapsPlaceUrl, nameSimilarity } from "@/lib/utils";

/**
 * CHANGES_20260814.md §2, revisited — the pure pieces of resolving a place
 * to its actual Google Maps listing: the confidence gate
 * (`nameSimilarity`, used alongside a distance check in
 * `lib/googlePlaces.ts`'s `findGooglePlaceId`) and the link builder
 * (`googleMapsPlaceUrl`). The network call itself (`findGooglePlaceId`)
 * isn't unit tested here, matching this repo's existing boundary — `onemap.ts`'s
 * live-call functions aren't tested either, only its pure helpers are.
 */

describe("nameSimilarity", () => {
  it("scores an exact match as 1", () => {
    expect(nameSimilarity("Two Men Bagel House", "Two Men Bagel House")).toBe(1);
  });

  it("ignores word order and case", () => {
    expect(nameSimilarity("bagel house two men", "Two Men Bagel House")).toBe(1);
  });

  it("scores a superset name partially, not as a full match", () => {
    const score = nameSimilarity(
      "Two Men Bagel House (Enggor St)",
      "Two Men Bagel House"
    );
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("scores completely unrelated names near zero", () => {
    expect(nameSimilarity("Two Men Bagel House", "Paragon Shopping Centre")).toBe(0);
  });

  it("is punctuation-insensitive", () => {
    expect(nameSimilarity("Ya Kun Kaya Toast!", "Ya Kun Kaya Toast")).toBe(1);
  });

  it("returns 0 for empty input rather than dividing by zero", () => {
    expect(nameSimilarity("", "Anything")).toBe(0);
    expect(nameSimilarity("Anything", "")).toBe(0);
  });
});

describe("googleMapsPlaceUrl", () => {
  const place = { name: "Ya Kun Kaya Toast", lat: 1.28, lng: 103.85 };

  it("links to the exact listing when a place id is present", () => {
    const url = googleMapsPlaceUrl({ ...place, google_place_id: "ChIJabc123" });

    expect(url).toContain("query_place_id=ChIJabc123");
    expect(url).toContain(encodeURIComponent(place.name));
  });

  it("falls back to a coordinate pin with no place id", () => {
    const url = googleMapsPlaceUrl({ ...place, google_place_id: null });

    expect(url).not.toContain("query_place_id");
    expect(url).toContain(`query=${place.lat},${place.lng}`);
  });

  it("falls back to a coordinate pin when the field is absent entirely", () => {
    const url = googleMapsPlaceUrl(place);

    expect(url).not.toContain("query_place_id");
    expect(url).toContain(`query=${place.lat},${place.lng}`);
  });
});
