import { haversine, nameSimilarity } from "./utils";
import type { Repo } from "./data";

/**
 * Resolves a place to its actual Google Maps listing — CHANGES_20260814.md
 * §2, revisited after the plain coordinate-based link (047) shipped. Same
 * "degrade rather than throw" spirit as `onemap.ts`: every function here
 * returns `null`/no-ops on any failure rather than propagating one, since a
 * missing or wrong Google listing should never be able to block adding or
 * editing a place.
 *
 * Uses the Places API (New) Text Search endpoint, requesting only
 * `id`/`displayName`/`location` — Google's Essentials (IDs Only) tier is
 * free even at volume; the extra `displayName`/`location` fields are what
 * this file actually needs to build its own confidence gate, so this isn't
 * the free tier, but at this app's scale (one small team, occasional place
 * adds/edits) the cost should be a handful of cents at most, ever — not
 * independently verified against Google's live billing console from this
 * environment, worth a spot-check once real usage starts.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/** How much of a place's own name has to reappear in Google's candidate. */
const MIN_NAME_SIMILARITY = 0.5;
/** How far Google's candidate may sit from our own geocoded pin. */
const MAX_DISTANCE_M = 300;

export function hasGooglePlacesCredentials(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

interface TextSearchResponse {
  places?: {
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
  }[];
}

/**
 * Finds the Google Place ID for a restaurant, gated on the returned
 * candidate actually looking like the same place — not just Google's own
 * ranking — since a chain with several outlets near the same postal code
 * is exactly the case a blind "take the top result" would get wrong.
 * Returns `null` on no confident match, no credentials, or any failure.
 */
export async function findGooglePlaceId(
  name: string,
  addressOrPostal: string | null,
  lat: number,
  lng: number
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const textQuery = addressOrPostal
      ? `${name}, Singapore ${addressOrPostal}`
      : `${name}, Singapore`;

    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location",
      },
      body: JSON.stringify({
        textQuery,
        // Biases ranking toward our already-geocoded pin — doesn't restrict
        // results to it, just helps Google prefer the right outlet among a
        // chain's several branches.
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 500 },
        },
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as TextSearchResponse;
    const top = json.places?.[0];
    if (!top?.id || !top.displayName?.text || !top.location) return null;
    if (
      typeof top.location.latitude !== "number" ||
      typeof top.location.longitude !== "number"
    ) {
      return null;
    }

    const similarity = nameSimilarity(top.displayName.text, name);
    if (similarity < MIN_NAME_SIMILARITY) return null;

    const distance = haversine(
      lat,
      lng,
      top.location.latitude,
      top.location.longitude
    );
    if (distance > MAX_DISTANCE_M) return null;

    return top.id;
  } catch {
    return null;
  }
}

/**
 * Resolves and stores a place's Google Place ID, best-effort. Called
 * right after a place is created, or after an edit that changed its
 * name/address (those are the only inputs the match depends on). Always
 * overwrites with the fresh result, including `null` on no match — a stale
 * id pointing at the place's *previous* name would be worse than no id at
 * all. No-ops entirely, touching nothing, when credentials aren't
 * configured.
 */
export async function resolveAndStoreGooglePlaceId(
  repo: Repo,
  place: { id: string; name: string; address?: string | null; lat: number; lng: number }
): Promise<void> {
  if (!hasGooglePlacesCredentials()) return;

  try {
    const placeId = await findGooglePlaceId(
      place.name,
      place.address ?? null,
      place.lat,
      place.lng
    );
    await repo.setGooglePlaceId(place.id, placeId);
  } catch {
    // Never let a lookup failure affect the place create/edit it rode in on.
  }
}
