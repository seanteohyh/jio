import { RECOMMEND_CONFIG as C } from "./recommendConfig";

/**
 * The Bayesian-smoothed rating, shared by every caller that needs one.
 *
 * A place with one 5-star rating should not outrank a place with twenty
 * 4.5-star ratings. Blending in a prior fixes that: the fewer real ratings a
 * place has, the harder its score is pulled toward the average.
 *
 * Takes the cheap, trigger-maintained `places.avg_rating`/`visit_count`
 * columns (021_place_ratings_trigger.sql) as the community signal, plus an
 * optional list of individual ratings to blend in on top (typically the
 * current user's own visits, weighted the same as anyone else's).
 *
 * Returns `null`, not a magic number, when there is no signal at all —
 * callers decide what that means for them rather than this function guessing.
 */
export function bayesianRating(
  avgRating: number | null | undefined,
  visitCount: number | null | undefined,
  extraRatings: number[] = []
): number | null {
  let sum = 0;
  let count = 0;

  if (
    typeof avgRating === "number" &&
    typeof visitCount === "number" &&
    visitCount > 0
  ) {
    sum += avgRating * visitCount;
    count += visitCount;
  }

  for (const rating of extraRatings) {
    sum += rating;
    count += 1;
  }

  if (count === 0) return null;

  return (C.rating.prior * C.rating.priorCount + sum) / (C.rating.priorCount + count);
}
