import { describe, expect, it } from "vitest";
import { bayesianRating } from "@/lib/rating";
import { RECOMMEND_CONFIG as C } from "@/lib/recommendConfig";

/**
 * The shared smoothing helper behind `places.avg_rating`/`visit_count`
 * (021_place_ratings_trigger.sql). `recommend.ts` centres and scales this;
 * these tests stay on the raw 1-5 scale it actually returns.
 */
describe("bayesianRating", () => {
  it("returns null when there is no signal at all", () => {
    expect(bayesianRating(null, 0, [])).toBeNull();
    expect(bayesianRating(undefined, undefined, [])).toBeNull();
  });

  it("pulls a single high rating hard toward the prior", () => {
    const smoothed = bayesianRating(null, 0, [5]);
    expect(smoothed).not.toBeNull();
    // One 5-star rating shouldn't read anywhere near a full 5 once smoothed.
    expect(smoothed!).toBeLessThan(5);
    expect(smoothed!).toBeGreaterThan(C.rating.prior);
  });

  it("trusts a large, consistent community sample more than a single rating", () => {
    const fewRatings = bayesianRating(null, 0, [5]);
    const manyRatings = bayesianRating(5, 50, []);

    expect(manyRatings!).toBeGreaterThan(fewRatings!);
    expect(manyRatings!).toBeGreaterThan(4.5);
  });

  it("blends the community aggregate with extra individual ratings", () => {
    const communityOnly = bayesianRating(4, 10, []);
    const withExtra = bayesianRating(4, 10, [5]);

    // Adding one more 5-star rating on top should nudge the result up.
    expect(withExtra!).toBeGreaterThan(communityOnly!);
  });

  it("ignores a zero visit_count community aggregate, using only extras", () => {
    const withZeroCount = bayesianRating(5, 0, [3]);
    const extrasOnly = bayesianRating(null, null, [3]);

    expect(withZeroCount).toBeCloseTo(extrasOnly!, 10);
  });
});
