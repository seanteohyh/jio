import { estimateWalkMinutes, haversine } from "./utils";
import type { WalkingRoute } from "@/types";

/**
 * OneMap SG — free walking-route distances and times for Singapore.
 *
 * Straight-line distance understates a real walk (buildings, crossings,
 * overhead bridges), so where OneMap is configured the numbers get noticeably
 * more honest. Where it is not, everything still works on haversine estimates.
 */

const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";
const ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route";
const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // OneMap tokens last 3 days.
const TOKEN_REFRESH_EARLY_MS = 12 * 60 * 60 * 1000; // Refresh with 12h to spare.

interface TokenCache {
  token: string;
  expiresAt: number;
}

const globalCache = globalThis as typeof globalThis & {
  __jioOneMapToken?: TokenCache | null;
  __jioOneMapCalls?: number[];
};

export function clearTokenCache(): void {
  globalCache.__jioOneMapToken = null;
}

export function hasOneMapCredentials(): boolean {
  return Boolean(process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD);
}

export async function getToken(): Promise<string | null> {
  const cached = globalCache.__jioOneMapToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) return null;

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return null;

    const json = (await response.json()) as { access_token?: string };
    if (!json.access_token) return null;

    globalCache.__jioOneMapToken = {
      token: json.access_token,
      expiresAt: Date.now() + TOKEN_TTL_MS - TOKEN_REFRESH_EARLY_MS,
    };
    return json.access_token;
  } catch {
    return null;
  }
}

/**
 * Sliding-window throttle. OneMap allows 200 calls a minute; the walk-time
 * enrichment script would blow straight past that without this.
 */
export async function throttledCall<T>(
  fn: () => Promise<T>,
  maxPerMin = 200
): Promise<T> {
  const calls = globalCache.__jioOneMapCalls ?? [];
  globalCache.__jioOneMapCalls = calls;

  const now = Date.now();
  // Drop anything that has fallen out of the 60-second window.
  while (calls.length > 0 && now - calls[0] > 60000) calls.shift();

  if (calls.length >= maxPerMin) {
    const waitMs = 60000 - (now - calls[0]) + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return throttledCall(fn, maxPerMin);
  }

  calls.push(Date.now());
  return fn();
}

/** Decode a Google-encoded polyline into [lat, lng] pairs. */
export function decodePolyline(
  encoded: string,
  precision = 5
): [number, number][] {
  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);

  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let b: number;

    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Haversine fallback, shaped like a route so callers need no special case. */
export function haversineRoute(from: LatLng, to: LatLng): WalkingRoute {
  const distance = haversine(from.lat, from.lng, to.lat, to.lng);
  return {
    distance_m: Math.round(distance),
    walk_minutes: estimateWalkMinutes(distance),
    polyline: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    source: "haversine",
  };
}

interface OneMapRouteResponse {
  route_summary?: { total_distance?: number; total_time?: number };
  route_geometry?: string;
}

/**
 * Walking route between two points.
 *
 * Retries once on a 401, since the most likely cause is a token that expired
 * earlier than we expected. Any other failure degrades to haversine rather
 * than surfacing an error — a slightly wrong walk time beats a broken page.
 */
export async function getWalkingRoute(
  from: LatLng,
  to: LatLng
): Promise<WalkingRoute> {
  if (!hasOneMapCredentials()) return haversineRoute(from, to);

  const attempt = async (token: string): Promise<Response> => {
    const url =
      `${ROUTE_URL}?start=${from.lat},${from.lng}` +
      `&end=${to.lat},${to.lng}&routeType=walk`;
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  };

  try {
    let token = await getToken();
    if (!token) return haversineRoute(from, to);

    let response = await throttledCall(() => attempt(token as string));

    if (response.status === 401) {
      clearTokenCache();
      token = await getToken();
      if (!token) return haversineRoute(from, to);
      response = await throttledCall(() => attempt(token as string));
    }

    if (!response.ok) return haversineRoute(from, to);

    const json = (await response.json()) as OneMapRouteResponse;
    const distance = json.route_summary?.total_distance;
    if (typeof distance !== "number") return haversineRoute(from, to);

    const seconds = json.route_summary?.total_time;
    const minutes =
      typeof seconds === "number" && seconds > 0
        ? Math.max(1, Math.round(seconds / 60))
        : estimateWalkMinutes(distance);

    return {
      distance_m: Math.round(distance),
      walk_minutes: minutes,
      polyline: json.route_geometry
        ? decodePolyline(json.route_geometry)
        : undefined,
      source: "onemap",
    };
  } catch {
    return haversineRoute(from, to);
  }
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** The building/address OneMap resolved this to, for display/confirmation. */
  address: string;
}

interface OneMapSearchResult {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
}

interface OneMapSearchResponse {
  found?: number;
  results?: OneMapSearchResult[];
}

async function searchOneMap(searchVal: string): Promise<GeocodeResult | null> {
  const url =
    `${SEARCH_URL}?searchVal=${encodeURIComponent(searchVal)}` +
    `&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const json = (await response.json()) as OneMapSearchResponse;
  const top = json.results?.[0];
  if (!top?.LATITUDE || !top?.LONGITUDE) return null;

  const lat = Number(top.LATITUDE);
  const lng = Number(top.LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    address: top.ADDRESS || [top.BLK_NO, top.ROAD_NAME].filter(Boolean).join(" ") || searchVal,
  };
}

/** Matches a 6-digit Singapore postal code, optionally prefixed with a
 *  leading "S" directly against the digits (the common "S018981" display
 *  notation, no space) — see `extractPostalCode`'s own doc comment for why
 *  that prefix needs its own handling. */
const POSTAL_CODE_RE = /\bS?(\d{6})\b/i;

/**
 * Pulls a bare 6-digit Singapore postal code out of a free-form address, or
 * `null` if none is present. Exported and tested on its own (unlike the
 * network-calling functions below, which this file leaves untested by
 * existing convention) because it's a real, previously-silent bug surface:
 * a plain `\b\d{6}\b` misses the common "S018981" notation entirely — S and
 * the first digit are both word characters, so there's no `\b` boundary
 * between them for the regex to anchor on, and the whole match fails
 * without a hint. Always returns the bare digits, never the S prefix —
 * OneMap's index wants the plain code, not the display form.
 */
export function extractPostalCode(input: string): string | null {
  const match = input.match(POSTAL_CODE_RE);
  return match ? match[1] : null;
}

/**
 * Turns an address or postal code into coordinates, so adding a place never
 * requires typing latitude/longitude by hand. This is OneMap's public
 * search endpoint — no auth token needed, unlike routing — so it works even
 * without ONEMAP_EMAIL/ONEMAP_PASSWORD configured.
 *
 * A full address pasted from Google Maps (e.g. "Paragon, 290 Orchard Rd,
 * #04-31, Singapore 238859") often has a business-name prefix and unit
 * number OneMap's road/block index can't parse as one blob, so a raw search
 * on it can come back empty. When a 6-digit postal code is present in the
 * input, search on that first — a bare postal code is a precise,
 * near-unambiguous lookup that resolves reliably — falling back to the raw
 * full-string search (today's behaviour) only when no code is found.
 *
 * Returns `null` on no match or any network failure, same "degrade rather
 * than throw" spirit as the rest of this file — the caller decides what a
 * failed lookup means (ask for a more specific address, or fall back to
 * "use my current location").
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const postalCode = extractPostalCode(trimmed);
    if (postalCode) {
      const byPostal = await searchOneMap(postalCode);
      if (byPostal) return byPostal;
    }

    return await searchOneMap(trimmed);
  } catch {
    return null;
  }
}
