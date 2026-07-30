import { RECOMMEND_CONFIG as C } from "./recommendConfig";
import { formatCuisine } from "./utils";
import type {
  MemberData,
  Place,
  RankOptions,
  ScoreBreakdown,
  ScoredPlace,
  UserPrefs,
  Visit,
} from "@/types";

/**
 * The recommendation engine.
 *
 * Every function here is pure: same inputs, same outputs, no I/O, no clock
 * unless you pass one in. That is what makes the scoring testable and what
 * lets the "why this?" hints be honest — they read the same numbers the
 * ranking used.
 */

// ---------------------------------------------------------------------------
// Cuisine affinity
// ---------------------------------------------------------------------------

/**
 * Learn how much the user likes each cuisine from what they have rated.
 *
 * A cuisine's affinity is the mean rating of visits to places carrying that
 * cuisine, centred on the midpoint and scaled into roughly [-1, 1]. A place
 * with several cuisines contributes its rating to each of them.
 */
export function learnCuisineAffinity(
  visits: Visit[],
  places: Place[]
): Map<string, number> {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const totals = new Map<string, { sum: number; count: number }>();

  for (const visit of visits) {
    const place = placeById.get(visit.place_id);
    if (!place || typeof visit.rating !== "number") continue;
    for (const cuisine of place.cuisine) {
      const entry = totals.get(cuisine) || { sum: 0, count: 0 };
      entry.sum += visit.rating;
      entry.count += 1;
      totals.set(cuisine, entry);
    }
  }

  const affinity = new Map<string, number>();
  for (const [cuisine, { sum, count }] of totals) {
    const mean = sum / count;
    affinity.set(cuisine, (mean - C.rating.midpoint) / C.rating.scale);
  }
  return affinity;
}

/**
 * Score a single place on cuisine, blending learned affinity with the user's
 * explicitly stated likes and dislikes.
 */
export function cuisineAffinityScore(
  place: Place,
  learned: Map<string, number>,
  prefs: UserPrefs | null
): number {
  if (!place.cuisine || place.cuisine.length === 0) return 0;

  let total = 0;
  for (const cuisine of place.cuisine) {
    let value = learned.get(cuisine) ?? 0;
    if (prefs?.cuisine_likes?.includes(cuisine)) value += C.cuisine.likeBonus;
    if (prefs?.cuisine_dislikes?.includes(cuisine)) {
      value -= C.cuisine.dislikePenalty;
    }
    total += value;
  }
  return total / place.cuisine.length;
}

// ---------------------------------------------------------------------------
// Bayesian rating
// ---------------------------------------------------------------------------

/**
 * A place with one 5-star rating should not outrank a place with twenty
 * 4.5-star ratings. Blending in a prior fixes that: the fewer real ratings a
 * place has, the harder its score is pulled toward the average.
 */
export function bayesianRatingScore(place: Place, userVisits: Visit[]): number {
  const mine = userVisits.filter(
    (v) => v.place_id === place.id && typeof v.rating === "number"
  );

  let sum = 0;
  let count = 0;

  // Community signal, when the repo has enriched the place with aggregates.
  if (
    typeof place.avg_rating === "number" &&
    typeof place.visit_count === "number" &&
    place.visit_count > 0
  ) {
    sum += place.avg_rating * place.visit_count;
    count += place.visit_count;
  }

  // The user's own ratings, weighted the same as anyone else's.
  for (const visit of mine) {
    sum += visit.rating;
    count += 1;
  }

  if (count === 0) return 0;

  const smoothed =
    (C.rating.prior * C.rating.priorCount + sum) / (C.rating.priorCount + count);
  return (smoothed - C.rating.midpoint) / C.rating.scale;
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export function budgetFitScore(place: Place, prefs: UserPrefs | null): number {
  if (!prefs) return C.budget.inRange;

  const min = prefs.budget_min ?? 1;
  const max = prefs.budget_max ?? 4;
  const tier = place.budget_tier;

  if (tier >= min && tier <= max) return C.budget.inRange;
  if (tier === min - 1 || tier === max + 1) return C.budget.adjacent;
  return C.budget.outOfRange;
}

// ---------------------------------------------------------------------------
// Walk time
// ---------------------------------------------------------------------------

/**
 * Always <= 0. The first few minutes are free — nobody minds a short walk —
 * and beyond that each minute costs a little, down to a floor.
 *
 * `weatherMultiplier` is 2 when rain is likely, which is what makes the app
 * quietly favour closer places on a wet day.
 */
export function walkPenaltyScore(place: Place, weatherMultiplier = 1): number {
  const minutes = place.walk_minutes;
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return 0;
  if (minutes <= C.walk.freeMinutes) return 0;

  const excess = minutes - C.walk.freeMinutes;
  const raw = -excess * C.walk.penaltyPerMinute * weatherMultiplier;
  return Math.max(C.walk.floor * weatherMultiplier, raw);
}

// ---------------------------------------------------------------------------
// Variety
// ---------------------------------------------------------------------------

/**
 * Discourages eating at the same place two days running, encourages trying
 * somewhere new, and lets a favourite come back into rotation as the memory of
 * the last visit fades.
 */
export function varietyBonusScore(
  place: Place,
  userVisits: Visit[],
  now: Date = new Date()
): number {
  const mine = userVisits.filter((v) => v.place_id === place.id);
  if (mine.length === 0) return C.variety.explorationBonus;

  const lastVisit = mine.reduce((latest, visit) => {
    const a = new Date(visit.visited_at).getTime();
    const b = new Date(latest.visited_at).getTime();
    return a > b ? visit : latest;
  });

  const daysSince =
    (now.getTime() - new Date(lastVisit.visited_at).getTime()) / 86400000;

  if (daysSince < 0) return C.variety.recentPenalty;
  if (daysSince <= C.variety.recentDays) return C.variety.recentPenalty;

  // Exponential recovery: the penalty halves every `halfLifeDays`.
  const elapsed = daysSince - C.variety.recentDays;
  const decay = Math.pow(0.5, elapsed / C.variety.halfLifeDays);
  return C.variety.recentPenalty * decay;
}

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

/** Hard filters. An excluded place never appears, whatever it scores. */
export function isExcluded(place: Place, prefs: UserPrefs | null): boolean {
  if (place.status === "blocked") return true;
  if (prefs?.blocklist?.includes(place.id)) return true;

  const dislikes = prefs?.cuisine_dislikes ?? [];
  if (
    dislikes.length > 0 &&
    place.cuisine.length > 0 &&
    place.cuisine.every((c) => dislikes.includes(c))
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function weightedTotal(breakdown: ScoreBreakdown): number {
  return (
    breakdown.cuisineAffinity * C.weights.cuisineAffinity +
    breakdown.bayesianRating * C.weights.bayesianRating +
    breakdown.budgetFit * C.weights.budgetFit +
    breakdown.walkPenalty * C.weights.walkPenalty +
    breakdown.varietyBonus * C.weights.varietyBonus +
    breakdown.wishlistBoost * C.weights.wishlistBoost +
    breakdown.recoBoost * C.weights.recoBoost
  );
}

function dominantReason(breakdown: ScoreBreakdown): keyof ScoreBreakdown {
  const contributions: [keyof ScoreBreakdown, number][] = [
    ["cuisineAffinity", breakdown.cuisineAffinity * C.weights.cuisineAffinity],
    ["bayesianRating", breakdown.bayesianRating * C.weights.bayesianRating],
    ["budgetFit", breakdown.budgetFit * C.weights.budgetFit],
    ["walkPenalty", breakdown.walkPenalty * C.weights.walkPenalty],
    ["varietyBonus", breakdown.varietyBonus * C.weights.varietyBonus],
    ["wishlistBoost", breakdown.wishlistBoost * C.weights.wishlistBoost],
    ["recoBoost", breakdown.recoBoost * C.weights.recoBoost],
  ];

  let best = contributions[0];
  for (const entry of contributions) {
    if (entry[1] > best[1]) best = entry;
  }
  return best[0];
}

/**
 * Score and sort places for one person.
 *
 * Returns every eligible place, best first, each carrying the full breakdown
 * that produced its score so the UI can explain itself.
 */
export function rankPlaces(
  places: Place[],
  visits: Visit[],
  prefs: UserPrefs | null,
  wishlistPlaceIds: string[] = [],
  options: RankOptions = {}
): ScoredPlace[] {
  const {
    weatherMultiplier = 1,
    recoPlaceIds = [],
    now = new Date(),
    limit,
    cuisines,
    maxWalkMinutes,
  } = options;

  const learned = learnCuisineAffinity(visits, places);
  const wishlist = new Set(wishlistPlaceIds);
  const recos = new Set(recoPlaceIds);

  const scored: ScoredPlace[] = [];

  for (const place of places) {
    if (isExcluded(place, prefs)) continue;
    if (place.status === "needs_review") continue;

    if (cuisines && cuisines.length > 0) {
      if (!place.cuisine.some((c) => cuisines.includes(c))) continue;
    }

    if (
      typeof maxWalkMinutes === "number" &&
      typeof place.walk_minutes === "number" &&
      place.walk_minutes > maxWalkMinutes
    ) {
      continue;
    }

    const breakdown: ScoreBreakdown = {
      cuisineAffinity: cuisineAffinityScore(place, learned, prefs),
      bayesianRating: bayesianRatingScore(place, visits),
      budgetFit: budgetFitScore(place, prefs),
      walkPenalty: walkPenaltyScore(place, weatherMultiplier),
      varietyBonus: varietyBonusScore(place, visits, now),
      wishlistBoost: wishlist.has(place.id) ? C.boosts.wishlist : 0,
      recoBoost: recos.has(place.id) ? C.boosts.reco : 0,
    };

    scored.push({
      place,
      score: weightedTotal(breakdown),
      breakdown,
      topReason: dominantReason(breakdown),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.place.name.localeCompare(b.place.name);
  });

  return typeof limit === "number" ? scored.slice(0, limit) : scored;
}

/**
 * Group mode.
 *
 * Each member is scored independently and the group score is the mean. A place
 * excluded by *any* member is excluded for the group — one person's allergy or
 * hard no outranks everyone else's mild preference.
 */
export function groupRecommend(
  membersData: MemberData[],
  places: Place[],
  options: RankOptions = {}
): ScoredPlace[] {
  if (membersData.length === 0) return rankPlaces(places, [], null, [], options);

  const perMember = membersData.map((member) =>
    rankPlaces(
      places,
      member.visits,
      member.prefs,
      member.wishlistPlaceIds,
      options
    )
  );

  // A place must survive every member's exclusions to be group-eligible.
  const eligible = new Set(perMember[0].map((s) => s.place.id));
  for (let i = 1; i < perMember.length; i++) {
    const memberIds = new Set(perMember[i].map((s) => s.place.id));
    for (const id of Array.from(eligible)) {
      if (!memberIds.has(id)) eligible.delete(id);
    }
  }

  const accumulated = new Map<
    string,
    { place: Place; total: number; breakdown: ScoreBreakdown }
  >();

  for (const memberScores of perMember) {
    for (const scored of memberScores) {
      if (!eligible.has(scored.place.id)) continue;
      const existing = accumulated.get(scored.place.id);
      if (!existing) {
        accumulated.set(scored.place.id, {
          place: scored.place,
          total: scored.score,
          breakdown: { ...scored.breakdown },
        });
      } else {
        existing.total += scored.score;
        for (const key of Object.keys(existing.breakdown) as (keyof ScoreBreakdown)[]) {
          existing.breakdown[key] += scored.breakdown[key];
        }
      }
    }
  }

  const n = membersData.length;
  const result: ScoredPlace[] = Array.from(accumulated.values()).map((entry) => {
    const breakdown = { ...entry.breakdown };
    for (const key of Object.keys(breakdown) as (keyof ScoreBreakdown)[]) {
      breakdown[key] = breakdown[key] / n;
    }
    return {
      place: entry.place,
      score: entry.total / n,
      breakdown,
      topReason: dominantReason(breakdown),
    };
  });

  result.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.place.name.localeCompare(b.place.name);
  });

  return typeof options.limit === "number"
    ? result.slice(0, options.limit)
    : result;
}

/**
 * Epsilon-greedy surprise.
 *
 * Most of the time it draws from the top of the ranking, so the suggestion is
 * plausible. The rest of the time it reaches into the long tail, which is the
 * only way a genuinely new favourite ever gets discovered.
 */
export function surprisePick(
  ranked: ScoredPlace[],
  rand: () => number = Math.random
): ScoredPlace | null {
  if (ranked.length === 0) return null;

  if (rand() < C.surprise.topProbability) {
    const pool = ranked.slice(0, Math.min(C.surprise.topN, ranked.length));
    return pool[Math.floor(rand() * pool.length)] ?? pool[0];
  }

  return ranked[Math.floor(rand() * ranked.length)] ?? ranked[0];
}

/** Human-readable justification for why a place ranked where it did. */
export function whyHint(scored: ScoredPlace): string {
  const { place, breakdown, topReason } = scored;

  switch (topReason) {
    case "cuisineAffinity": {
      const cuisine = place.cuisine[0]
        ? formatCuisine(place.cuisine[0])
        : "this kind of food";
      return breakdown.cuisineAffinity >= 0
        ? `You tend to rate ${cuisine} highly`
        : `A change from your usual`;
    }
    case "bayesianRating":
      return place.avg_rating
        ? `Well rated by the team (${place.avg_rating.toFixed(1)}★)`
        : `Well rated`;
    case "budgetFit":
      return `Fits your usual budget`;
    case "walkPenalty":
      return place.walk_minutes
        ? `${place.walk_minutes} min walk`
        : `Close by`;
    case "varietyBonus":
      return breakdown.varietyBonus > 0
        ? `Somewhere new for you`
        : `You were here recently`;
    case "wishlistBoost":
      return `On your want-to-try list`;
    case "recoBoost":
      return `Recommended by a teammate`;
    default:
      return `Worth a try`;
  }
}
