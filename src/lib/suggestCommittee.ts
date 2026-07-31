import { groupRecommend } from "./recommend";
import { bayesianRating } from "./rating";
import type { MemberData, Place, RankOptions } from "@/types";

/**
 * "Can't decide? Suggest 3" — the pure scoring half. I/O (loading places,
 * visits, prefs, event state) lives in each `Repo` implementation; this file
 * only decides which places to pick, given data already assembled.
 */

export interface CommitteeSuggestion {
  place: Place;
  kind: "personalized" | "exploratory";
}

/**
 * 2 personalized picks + 1 exploratory pick, for the group in `membersData`.
 *
 * Personalized reuses the existing `groupRecommend()` — no new scoring.
 * Exploratory is defined as novel *to this specific group* (none of them
 * have visited it), which is a different, deliberately narrower novelty
 * bar than `/suggest`'s globally-novel `surprisePick()`. Ranked within that
 * novel pool by the shared `bayesianRating()` helper; if the group's been
 * everywhere already (no novel places left), falls back to whichever
 * remaining candidate the group has visited the least.
 *
 * `excludePlaceIds` covers both places already an option on the event and
 * (on a re-roll) places suggested earlier in the same session.
 */
export function pickCommitteeSuggestions(
  places: Place[],
  membersData: MemberData[],
  excludePlaceIds: Set<string>,
  options: RankOptions = {}
): CommitteeSuggestion[] {
  const ranked = groupRecommend(membersData, places, options).filter(
    (s) => !excludePlaceIds.has(s.place.id)
  );
  const personalized = ranked.slice(0, 2);
  const personalizedIds = new Set(personalized.map((s) => s.place.id));

  const candidatePool = places.filter(
    (p) =>
      p.status === "active" &&
      !excludePlaceIds.has(p.id) &&
      !personalizedIds.has(p.id)
  );

  const visitedByGroup = new Set(
    membersData.flatMap((m) => m.visits.map((v) => v.place_id))
  );
  const novelPool = candidatePool.filter((p) => !visitedByGroup.has(p.id));

  let exploratory: Place | null = null;

  if (novelPool.length > 0) {
    exploratory = novelPool.reduce<Place | null>((best, place) => {
      const score = bayesianRating(place.avg_rating, place.visit_count) ?? -Infinity;
      const bestScore = best
        ? (bayesianRating(best.avg_rating, best.visit_count) ?? -Infinity)
        : -Infinity;
      return score > bestScore ? place : best;
    }, null);
  } else if (candidatePool.length > 0) {
    // The group's visited everywhere left — fall back to whichever
    // candidate they've collectively visited the least.
    const visitCounts = new Map<string, number>();
    for (const member of membersData) {
      for (const visit of member.visits) {
        visitCounts.set(visit.place_id, (visitCounts.get(visit.place_id) ?? 0) + 1);
      }
    }
    exploratory = candidatePool.reduce<Place | null>((least, place) => {
      const count = visitCounts.get(place.id) ?? 0;
      const leastCount = least ? (visitCounts.get(least.id) ?? 0) : Infinity;
      return count < leastCount ? place : least;
    }, null);
  }

  const result: CommitteeSuggestion[] = personalized.map((s) => ({
    place: s.place,
    kind: "personalized" as const,
  }));
  if (exploratory) result.push({ place: exploratory, kind: "exploratory" });

  return result;
}
