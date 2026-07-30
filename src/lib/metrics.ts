import { budgetLabel } from "./constants";
import type {
  CuisineStreak,
  FavouritePlace,
  KakiMember,
  KakiMetrics,
  Place,
  UserMetrics,
  Visit,
} from "@/types";

/**
 * Visit-derived statistics. All pure functions over arrays already in memory.
 */

function emptyUserMetrics(): UserMetrics {
  return {
    totalVisits: 0,
    distinctPlaces: 0,
    favouritePlaces: [],
    avgRatingGiven: 0,
    cuisineBreakdown: {},
    avgBudgetTier: 0,
    avgBudgetLabel: "—",
    mostActiveMonth: null,
    currentVariety: 0,
  };
}

export function computeUserMetrics(
  visits: Visit[],
  places: Place[],
  now: Date = new Date()
): UserMetrics {
  if (visits.length === 0) return emptyUserMetrics();

  const placeById = new Map(places.map((p) => [p.id, p]));

  const perPlace = new Map<
    string,
    { count: number; ratingSum: number; ratingCount: number }
  >();
  let ratingSum = 0;
  let ratingCount = 0;
  let budgetSum = 0;
  let budgetCount = 0;
  const cuisineShares: Record<string, number> = {};
  const monthCounts = new Map<string, number>();

  for (const visit of visits) {
    const entry = perPlace.get(visit.place_id) || {
      count: 0,
      ratingSum: 0,
      ratingCount: 0,
    };
    entry.count += 1;
    if (typeof visit.rating === "number") {
      entry.ratingSum += visit.rating;
      entry.ratingCount += 1;
      ratingSum += visit.rating;
      ratingCount += 1;
    }
    perPlace.set(visit.place_id, entry);

    const place = placeById.get(visit.place_id);
    if (place) {
      budgetSum += place.budget_tier;
      budgetCount += 1;

      // Each visit contributes one whole "vote" split across its cuisines, so
      // the shares always sum to 1 regardless of how many tags a place carries.
      const cuisines = place.cuisine.length > 0 ? place.cuisine : ["other"];
      const share = 1 / cuisines.length;
      for (const cuisine of cuisines) {
        cuisineShares[cuisine] = (cuisineShares[cuisine] || 0) + share;
      }
    }

    const monthKey = visit.visited_at.slice(0, 7);
    monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
  }

  const favouritePlaces: FavouritePlace[] = Array.from(perPlace.entries())
    .map(([placeId, stats]) => ({
      place_id: placeId,
      place_name: placeById.get(placeId)?.name ?? "Unknown place",
      visit_count: stats.count,
      avg_rating:
        stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : 0,
    }))
    .sort((a, b) => {
      if (b.visit_count !== a.visit_count) return b.visit_count - a.visit_count;
      if (b.avg_rating !== a.avg_rating) return b.avg_rating - a.avg_rating;
      return a.place_name.localeCompare(b.place_name);
    })
    .slice(0, 5);

  // Normalise cuisine shares to fractions of total visits.
  const totalShare = Object.values(cuisineShares).reduce((a, b) => a + b, 0);
  const cuisineBreakdown: Record<string, number> = {};
  if (totalShare > 0) {
    for (const [cuisine, share] of Object.entries(cuisineShares)) {
      cuisineBreakdown[cuisine] = share / totalShare;
    }
  }

  // Ties on month go to the most recent month.
  let mostActiveMonth: string | null = null;
  let bestMonthCount = -1;
  for (const [month, count] of Array.from(monthCounts.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    if (count >= bestMonthCount) {
      bestMonthCount = count;
      mostActiveMonth = month;
    }
  }

  const thirtyDaysAgo = now.getTime() - 30 * 86400000;
  const recentPlaces = new Set(
    visits
      .filter((v) => new Date(v.visited_at).getTime() >= thirtyDaysAgo)
      .map((v) => v.place_id)
  );

  const avgBudgetTier = budgetCount > 0 ? budgetSum / budgetCount : 0;

  return {
    totalVisits: visits.length,
    distinctPlaces: perPlace.size,
    favouritePlaces,
    avgRatingGiven: ratingCount > 0 ? ratingSum / ratingCount : 0,
    cuisineBreakdown,
    avgBudgetTier,
    avgBudgetLabel: budgetCount > 0 ? budgetLabel(avgBudgetTier) : "—",
    mostActiveMonth,
    currentVariety: recentPlaces.size,
  };
}

function emptyKakiMetrics(): KakiMetrics {
  return {
    groupTotalVisits: 0,
    groupDistinctPlaces: 0,
    groupFavouritePlaces: [],
    groupAvgBudgetTier: 0,
    groupAvgBudgetLabel: "—",
    groupCuisineBreakdown: {},
    mostActiveMember: null,
    adventurer: null,
  };
}

/**
 * Group statistics.
 *
 * Group favourites rank on *member coverage* rather than raw visit count — a
 * place four people have each been to once is a better group pick than one
 * place a single enthusiast has been to eight times.
 */
export function computeKakiMetrics(
  memberVisitsMap: Map<string, Visit[]>,
  places: Place[],
  members: KakiMember[]
): KakiMetrics {
  const memberIds = new Set(members.map((m) => m.user_id));
  const placeById = new Map(places.map((p) => [p.id, p]));

  const allVisits: Visit[] = [];
  for (const [userId, visits] of memberVisitsMap) {
    if (!memberIds.has(userId)) continue;
    allVisits.push(...visits);
  }

  if (allVisits.length === 0) return emptyKakiMetrics();

  const perPlace = new Map<
    string,
    { count: number; members: Set<string>; ratingSum: number; ratingCount: number }
  >();
  let budgetSum = 0;
  let budgetCount = 0;
  const cuisineShares: Record<string, number> = {};

  for (const visit of allVisits) {
    const entry = perPlace.get(visit.place_id) || {
      count: 0,
      members: new Set<string>(),
      ratingSum: 0,
      ratingCount: 0,
    };
    entry.count += 1;
    entry.members.add(visit.user_id);
    if (typeof visit.rating === "number") {
      entry.ratingSum += visit.rating;
      entry.ratingCount += 1;
    }
    perPlace.set(visit.place_id, entry);

    const place = placeById.get(visit.place_id);
    if (place) {
      budgetSum += place.budget_tier;
      budgetCount += 1;
      const cuisines = place.cuisine.length > 0 ? place.cuisine : ["other"];
      const share = 1 / cuisines.length;
      for (const cuisine of cuisines) {
        cuisineShares[cuisine] = (cuisineShares[cuisine] || 0) + share;
      }
    }
  }

  const groupFavouritePlaces: FavouritePlace[] = Array.from(perPlace.entries())
    .map(([placeId, stats]) => ({
      place_id: placeId,
      place_name: placeById.get(placeId)?.name ?? "Unknown place",
      visit_count: stats.count,
      avg_rating:
        stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : 0,
      _coverage: stats.members.size,
    }))
    .sort((a, b) => {
      if (b._coverage !== a._coverage) return b._coverage - a._coverage;
      if (b.visit_count !== a.visit_count) return b.visit_count - a.visit_count;
      return a.place_name.localeCompare(b.place_name);
    })
    .slice(0, 5)
    .map(({ _coverage: _ignored, ...rest }) => rest);

  const totalShare = Object.values(cuisineShares).reduce((a, b) => a + b, 0);
  const groupCuisineBreakdown: Record<string, number> = {};
  if (totalShare > 0) {
    for (const [cuisine, share] of Object.entries(cuisineShares)) {
      groupCuisineBreakdown[cuisine] = share / totalShare;
    }
  }

  let mostActiveMember: KakiMetrics["mostActiveMember"] = null;
  let adventurer: KakiMetrics["adventurer"] = null;

  for (const member of members) {
    const visits = (memberVisitsMap.get(member.user_id) || []).length;
    const distinct = new Set(
      (memberVisitsMap.get(member.user_id) || []).map((v) => v.place_id)
    ).size;

    if (visits > 0 && (!mostActiveMember || visits > mostActiveMember.visits)) {
      mostActiveMember = { user_id: member.user_id, visits };
    }
    if (
      distinct > 0 &&
      (!adventurer || distinct > adventurer.distinctPlaces)
    ) {
      adventurer = { user_id: member.user_id, distinctPlaces: distinct };
    }
  }

  const groupAvgBudgetTier = budgetCount > 0 ? budgetSum / budgetCount : 0;

  return {
    groupTotalVisits: allVisits.length,
    groupDistinctPlaces: perPlace.size,
    groupFavouritePlaces,
    groupAvgBudgetTier,
    groupAvgBudgetLabel: budgetCount > 0 ? budgetLabel(groupAvgBudgetTier) : "—",
    groupCuisineBreakdown,
    mostActiveMember,
    adventurer,
  };
}

/**
 * Longest run of consecutive eating-days sharing a cuisine.
 *
 * Days with no visit do not break the streak — three Japanese lunches on
 * Monday, Wednesday and Friday is still a Japanese streak. This is what powers
 * the "3 days of Japanese, break the streak?" nudge on the home page.
 */
export function computeCuisineStreak(
  visits: Visit[],
  places: Place[]
): CuisineStreak | null {
  if (visits.length < 2) return null;

  const placeById = new Map(places.map((p) => [p.id, p]));

  // Collapse to one cuisine-set per distinct day, most recent last.
  const byDay = new Map<string, Set<string>>();
  for (const visit of visits) {
    const place = placeById.get(visit.place_id);
    if (!place) continue;
    const day = visit.visited_at.slice(0, 10);
    const set = byDay.get(day) || new Set<string>();
    for (const cuisine of place.cuisine) set.add(cuisine);
    byDay.set(day, set);
  }

  const days = Array.from(byDay.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  if (days.length < 2) return null;

  // Walk backwards from the most recent day for as long as one cuisine holds.
  let running = new Set(days[days.length - 1][1]);
  let length = 1;

  for (let i = days.length - 2; i >= 0; i--) {
    const overlap = new Set(
      Array.from(running).filter((c) => days[i][1].has(c))
    );
    if (overlap.size === 0) break;
    running = overlap;
    length += 1;
  }

  if (length < 2) return null;

  // Prefer the most specific cuisine in the surviving set.
  const cuisine = Array.from(running).sort()[0];
  return { cuisine, days: length };
}
