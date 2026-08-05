import { describe, expect, it } from "vitest";
import { computeKakiRatingByPlace } from "@/lib/metrics";
import type { Visit } from "@/types";

/**
 * CHANGES_20260803_1.md §12f — "rated by your Kaki group" as a /places sort
 * mode. Same shape as a place's overall avg_rating, just scoped to a
 * member set rather than everyone.
 */
function visit(userId: string, placeId: string, rating: number): Visit {
  return {
    id: `${userId}-${placeId}`,
    place_id: placeId,
    user_id: userId,
    rating,
    best_dishes: [],
    visited_at: new Date().toISOString(),
    is_public: false,
  };
}

describe("computeKakiRatingByPlace", () => {
  it("averages ratings from members only, ignoring outsiders", () => {
    const visits = [
      visit("alex", "place-a", 5),
      visit("mei", "place-a", 3),
      visit("stranger", "place-a", 1),
    ];

    const result = computeKakiRatingByPlace(
      visits,
      new Set(["alex", "mei"])
    );

    expect(result["place-a"]).toBe(4);
  });

  it("omits a place nobody in the member set has rated", () => {
    const visits = [visit("stranger", "place-a", 5)];
    const result = computeKakiRatingByPlace(visits, new Set(["alex"]));

    expect(result["place-a"]).toBeUndefined();
  });

  it("scopes independently per place", () => {
    const visits = [
      visit("alex", "place-a", 4),
      visit("alex", "place-b", 2),
      visit("mei", "place-b", 4),
    ];

    const result = computeKakiRatingByPlace(
      visits,
      new Set(["alex", "mei"])
    );

    expect(result["place-a"]).toBe(4);
    expect(result["place-b"]).toBe(3);
  });
});
