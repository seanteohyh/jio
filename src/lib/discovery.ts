import { DEDUPE_PROXIMITY_M, WALK_RADIUS_M } from "./constants";
import { haversine } from "./utils";
import type {
  BudgetTier,
  OverpassElement,
  Place,
  PlaceCandidate,
} from "@/types";

/**
 * Discovering nearby food places from OpenStreetMap.
 *
 * OSM is open data with a licence that permits this, which is why the app uses
 * it rather than scraping a review site. The trade-off is quality: OSM entries
 * are uneven, so everything discovered lands in a `needs_review` queue for a
 * human to approve rather than going straight into the live list.
 */

const AMENITIES = ["restaurant", "cafe", "fast_food", "food_court"];

export function buildOverpassQuery(
  lat: number,
  lng: number,
  radiusM: number = WALK_RADIUS_M
): string {
  const filter = AMENITIES.join("|");
  return `[out:json][timeout:25];
(
  node["amenity"~"^(${filter})$"](around:${radiusM},${lat},${lng});
  way["amenity"~"^(${filter})$"](around:${radiusM},${lat},${lng});
);
out center tags;`;
}

export async function fetchOverpassElements(
  lat: number,
  lng: number,
  radiusM: number = WALK_RADIUS_M,
  endpoint = process.env.OVERPASS_API_URL ||
    "https://overpass-api.de/api/interpreter"
): Promise<OverpassElement[]> {
  const query = buildOverpassQuery(lat, lng, radiusM);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass returned ${response.status}`);
  }

  const json = (await response.json()) as { elements?: OverpassElement[] };
  return json.elements ?? [];
}

/** Map an OSM `cuisine` tag onto one of our known cuisine keys. */
const KNOWN_CUISINES = new Set([
  "chinese",
  "malay",
  "indian",
  "japanese",
  "korean",
  "thai",
  "vietnamese",
  "western",
  "italian",
  "local",
  "halal",
  "vegetarian",
  "cafe",
  "fast_food",
  "food_court",
  "dessert",
]);

const CUISINE_ALIASES: Record<string, string> = {
  burger: "fast_food",
  pizza: "fast_food",
  chicken: "fast_food",
  sandwich: "fast_food",
  kebab: "fast_food",
  noodle: "local",
  noodles: "local",
  rice: "local",
  hawker: "local",
  singaporean: "local",
  asian: "local",
  coffee_shop: "cafe",
  coffee: "cafe",
  bubble_tea: "dessert",
  ice_cream: "dessert",
  cake: "dessert",
  bakery: "dessert",
  american: "western",
  french: "western",
  steak_house: "western",
  pasta: "italian",
  sushi: "japanese",
  ramen: "japanese",
  indonesian: "malay",
  vegan: "vegetarian",
};

export function normalizeCuisine(raw: string | undefined): string[] {
  if (!raw) return ["other"];

  const parts = raw
    .toLowerCase()
    .split(/[;,]/)
    .map((s) => s.trim().replace(/\s+/g, "_"))
    .filter(Boolean);

  const mapped = new Set<string>();
  for (const part of parts) {
    if (KNOWN_CUISINES.has(part)) mapped.add(part);
    else if (CUISINE_ALIASES[part]) mapped.add(CUISINE_ALIASES[part]);
  }

  if (mapped.size === 0) return ["other"];
  return Array.from(mapped);
}

/** A rough price guess from the amenity type — a starting point for review. */
export function budgetByAmenity(amenity: string | undefined): BudgetTier {
  switch (amenity) {
    case "food_court":
    case "fast_food":
      return 1;
    case "cafe":
      return 2;
    default:
      return 3;
  }
}

/**
 * Turn one Overpass element into a candidate place, or reject it.
 *
 * Unnamed entries and entries without coordinates are useless to us; `way`
 * elements carry their coordinates on `center` rather than at the top level.
 */
export function normalizeElement(
  element: OverpassElement
): PlaceCandidate | null {
  const tags = element.tags || {};
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const addressParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:postcode"],
  ].filter(Boolean);

  return {
    name,
    lat,
    lng,
    cuisine: normalizeCuisine(tags.cuisine),
    budget_tier: budgetByAmenity(tags.amenity),
    osm_id: element.id,
    source: "discovery",
    status: "needs_review",
    address: addressParts.length > 0 ? addressParts.join(" ") : null,
  };
}

/**
 * Drop candidates we already have.
 *
 * Two passes: exact `osm_id` matches, then same-name-and-nearly-same-spot,
 * which catches the common case of a place added by hand before OSM knew
 * about it. Also de-duplicates within the incoming batch.
 */
export function dedupePlaces(
  candidates: PlaceCandidate[],
  existing: Pick<Place, "name" | "lat" | "lng" | "osm_id">[]
): PlaceCandidate[] {
  const existingOsmIds = new Set(
    existing
      .map((p) => p.osm_id)
      .filter((id): id is number => typeof id === "number")
  );

  const result: PlaceCandidate[] = [];
  const seenInBatch = new Set<number>();

  for (const candidate of candidates) {
    if (existingOsmIds.has(candidate.osm_id)) continue;
    if (seenInBatch.has(candidate.osm_id)) continue;

    const duplicate = existing.some((place) => {
      if (place.name.toLowerCase() !== candidate.name.toLowerCase()) {
        return false;
      }
      return (
        haversine(place.lat, place.lng, candidate.lat, candidate.lng) <=
        DEDUPE_PROXIMITY_M
      );
    });
    if (duplicate) continue;

    seenInBatch.add(candidate.osm_id);
    result.push(candidate);
  }

  return result;
}
