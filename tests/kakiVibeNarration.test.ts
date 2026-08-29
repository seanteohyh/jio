import { describe, expect, it } from "vitest";
import { narrateVibe } from "@/components/kakis/KakiFoodIdentityCard";
import type { KakiMetrics } from "@/types";

/**
 * UX review log #24 — the vibe card's one new narrated sentence, built only
 * from fields the app already computes (top cuisine + its share, top
 * favourite's visit count + rating). No new data invented.
 */

function baseMetrics(overrides: Partial<KakiMetrics> = {}): KakiMetrics {
  return {
    groupTotalVisits: 0,
    groupDistinctPlaces: 0,
    groupFavouritePlaces: [],
    groupAvgBudgetTier: 2,
    groupAvgBudgetLabel: "$$",
    groupCuisineBreakdown: {},
    mostActiveMember: null,
    adventurer: null,
    ...overrides,
  };
}

describe("narrateVibe", () => {
  it("combines the top cuisine's share and the top favourite's stats", () => {
    const sentence = narrateVibe(
      baseMetrics({
        groupCuisineBreakdown: { japanese: 0.4, chinese: 0.3 },
        groupFavouritePlaces: [
          {
            place_id: "p1",
            place_name: "Ichiban Boshi",
            visit_count: 5,
            avg_rating: 4.6,
          },
        ],
      })
    );
    expect(sentence).toContain("40%");
    expect(sentence).toContain("Japanese");
    expect(sentence).toContain("Ichiban Boshi");
    expect(sentence).toContain("5 visits");
    expect(sentence).toContain("4.6★");
  });

  it("uses singular 'visit' for exactly one", () => {
    const sentence = narrateVibe(
      baseMetrics({
        groupCuisineBreakdown: { chinese: 0.5 },
        groupFavouritePlaces: [
          {
            place_id: "p1",
            place_name: "Zam Zam",
            visit_count: 1,
            avg_rating: 5,
          },
        ],
      })
    );
    expect(sentence).toContain("1 visit ");
  });

  it("falls back to cuisine only when there is no favourite yet", () => {
    const sentence = narrateVibe(
      baseMetrics({ groupCuisineBreakdown: { thai: 0.6 } })
    );
    expect(sentence).toContain("60%");
    expect(sentence).toContain("Thai");
    expect(sentence).not.toBeNull();
  });

  it("falls back to the favourite only when there is no cuisine data", () => {
    const sentence = narrateVibe(
      baseMetrics({
        groupFavouritePlaces: [
          {
            place_id: "p1",
            place_name: "Kok Sen",
            visit_count: 3,
            avg_rating: 4.2,
          },
        ],
      })
    );
    expect(sentence).toContain("Kok Sen");
  });

  it("returns null when there is nothing at all to narrate", () => {
    expect(narrateVibe(baseMetrics())).toBeNull();
  });
});
