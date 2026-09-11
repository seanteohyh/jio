import type { Place } from "@/types";

/**
 * Several places sharing (almost) the same coordinates — a food court's
 * stalls, a mall's food floor — all geocode to one building and used to
 * stack invisibly under a single clickable map marker, so only whichever
 * place happened to be on top was ever reachable. Grouped to a ~11m grid (4
 * decimal places) rather than exact equality, since two independently
 * geocoded addresses for the same building rarely land on the identical
 * float.
 */
export const CLUSTER_GRID_DECIMALS = 4;

export function clusterKey(place: Place): string {
  return `${place.lat.toFixed(CLUSTER_GRID_DECIMALS)},${place.lng.toFixed(CLUSTER_GRID_DECIMALS)}`;
}

/** Groups places for the map, preserving each group's original insertion
 *  order. A group of one is the common case; a group of more than one is a
 *  cluster whose marker should list every member instead of picking one. */
export function clusterPlaces(places: Place[]): Place[][] {
  const groups = new Map<string, Place[]>();
  for (const place of places) {
    const key = clusterKey(place);
    const list = groups.get(key);
    if (list) list.push(place);
    else groups.set(key, [place]);
  }
  return Array.from(groups.values());
}

/** A place worth calling out on the map regardless of who's looking — an
 *  objective, non-personalized signal, unlike Places' own "your Kakis"
 *  badge or its personalized "New to try" rail (never-visited-by-you). */
export const HIGH_RATING_THRESHOLD = 4.5;
/** Same "a lone review isn't consensus" floor the Kaki-rating badge already
 *  applies, just without requiring the raters be in one Kaki. */
export const MIN_VISITS_FOR_HIGH_RATING_BADGE = 2;
export const NEW_LISTING_WINDOW_DAYS = 14;

export function isHighlyRated(place: Place): boolean {
  return (
    typeof place.avg_rating === "number" &&
    place.avg_rating >= HIGH_RATING_THRESHOLD &&
    (place.visit_count ?? 0) >= MIN_VISITS_FOR_HIGH_RATING_BADGE
  );
}

export function isNewListing(place: Place, now: number = Date.now()): boolean {
  if (!place.created_at) return false;
  const ageDays = (now - new Date(place.created_at).getTime()) / 86400000;
  return ageDays <= NEW_LISTING_WINDOW_DAYS;
}
