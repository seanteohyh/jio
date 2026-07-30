import { config } from "@/lib/config";
import {
  getWalkingRoute as oneMapRoute,
  haversineRoute,
  type LatLng,
} from "@/lib/onemap";
import type { WalkingRoute } from "@/types";

/**
 * Routing seam.
 *
 * Swapping in Google Directions, Mapbox or a self-hosted OSRM is a matter of
 * writing one object with this shape and adding a case to the switch below.
 * Nothing else in the app touches a routing API directly.
 */
export interface RoutingProvider {
  readonly name: string;
  /** True when the provider has whatever credentials it needs. */
  isConfigured(): boolean;
  route(from: LatLng, to: LatLng): Promise<WalkingRoute>;
}

export const haversineProvider: RoutingProvider = {
  name: "haversine",
  isConfigured: () => true,
  route: async (from, to) => haversineRoute(from, to),
};

export const oneMapProvider: RoutingProvider = {
  name: "onemap",
  isConfigured: () =>
    Boolean(process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD),
  route: (from, to) => oneMapRoute(from, to),
};

export function getRoutingProvider(): RoutingProvider {
  switch (config.routingProvider) {
    case "onemap":
      return oneMapProvider.isConfigured() ? oneMapProvider : haversineProvider;
    case "haversine":
    default:
      return haversineProvider;
  }
}

export type { LatLng };
