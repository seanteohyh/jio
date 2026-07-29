import { config } from "@/lib/config";
import {
  dedupePlaces,
  fetchOverpassElements,
  normalizeElement,
} from "@/lib/discovery";
import { WALK_RADIUS_M } from "@/lib/constants";
import type { Place, PlaceCandidate } from "@/types";

/**
 * Discovery seam.
 *
 * A provider's job: given a point and a radius, return candidate places that
 * are not already in `existing`. Swapping OSM for another open dataset means
 * writing one of these.
 */
export interface DiscoveryProvider {
  readonly name: string;
  discover(
    lat: number,
    lng: number,
    existing: Pick<Place, "name" | "lat" | "lng" | "osm_id">[],
    radiusM?: number
  ): Promise<{ fetched: number; candidates: PlaceCandidate[] }>;
}

export const overpassProvider: DiscoveryProvider = {
  name: "overpass",
  async discover(lat, lng, existing, radiusM = WALK_RADIUS_M) {
    const elements = await fetchOverpassElements(
      lat,
      lng,
      radiusM,
      config.overpassUrl
    );

    const normalized = elements
      .map(normalizeElement)
      .filter((c): c is PlaceCandidate => c !== null);

    return {
      fetched: elements.length,
      candidates: dedupePlaces(normalized, existing),
    };
  },
};

export const noDiscoveryProvider: DiscoveryProvider = {
  name: "none",
  async discover() {
    return { fetched: 0, candidates: [] };
  },
};

export function getDiscoveryProvider(): DiscoveryProvider {
  switch (config.discoveryProvider) {
    case "overpass":
      return overpassProvider;
    case "none":
    default:
      return noDiscoveryProvider;
  }
}
