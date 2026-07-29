import { haversine } from "./utils";
import type { WeatherForecast } from "@/types";

/**
 * NEA two-hour rain forecast, via data.gov.sg. Free and keyless.
 *
 * Used for one thing: doubling the walk penalty in the recommendation engine
 * when rain is likely, so the app quietly suggests closer places on a wet day.
 *
 * Every failure path resolves to `null`. Weather is a nice-to-have and must
 * never be able to break lunch suggestions.
 */

const ENDPOINT =
  "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast";

const SUCCESS_TTL_MS = 15 * 60 * 1000; // Forecasts update every 30 min.
const FAILURE_TTL_MS = 60 * 1000; // Back off, but recover quickly.

interface CacheEntry {
  value: WeatherForecast | null;
  expiresAt: number;
}

// Anchored on globalThis so every Next.js route bundle shares one cache
// instead of each holding its own and hammering the API.
const globalCache = globalThis as typeof globalThis & {
  __jioWeatherCache?: Map<string, CacheEntry>;
};

const cache: Map<string, CacheEntry> =
  globalCache.__jioWeatherCache ?? new Map<string, CacheEntry>();
globalCache.__jioWeatherCache = cache;

/** Wet-weather words as they appear in NEA forecast strings. */
export function isRainLikely(forecastText: string | null | undefined): boolean {
  if (!forecastText) return false;
  return /rain|shower|thunder/i.test(forecastText);
}

interface NeaArea {
  name: string;
  label_location: { latitude: number; longitude: number };
}

interface NeaResponse {
  data?: {
    area_metadata?: NeaArea[];
    items?: {
      valid_period?: { start?: string; end?: string; text?: string };
      forecasts?: { area: string; forecast: string }[];
    }[];
  };
}

/**
 * Forecast for the area nearest the given coordinates.
 *
 * Singapore is divided into ~47 named forecast areas; we pick the one whose
 * label point is closest.
 */
export async function getTwoHourForecast(
  lat: number,
  lng: number,
  timeoutMs = 6000
): Promise<WeatherForecast | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ENDPOINT, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`NEA returned ${response.status}`);

    const json = (await response.json()) as NeaResponse;
    const areas = json.data?.area_metadata ?? [];
    const item = json.data?.items?.[0];
    const forecasts = item?.forecasts ?? [];

    if (areas.length === 0 || forecasts.length === 0) {
      throw new Error("NEA response had no forecast data");
    }

    let nearest: NeaArea | null = null;
    let nearestDistance = Infinity;
    for (const area of areas) {
      const loc = area.label_location;
      if (!loc) continue;
      const distance = haversine(lat, lng, loc.latitude, loc.longitude);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = area;
      }
    }

    if (!nearest) throw new Error("No forecast area matched");

    const match = forecasts.find((f) => f.area === nearest!.name);
    if (!match) throw new Error("No forecast for the nearest area");

    const value: WeatherForecast = {
      area: match.area,
      forecast: match.forecast,
      validity: item?.valid_period?.text ?? "next 2 hours",
      rainLikely: isRainLikely(match.forecast),
    };

    cache.set(key, { value, expiresAt: Date.now() + SUCCESS_TTL_MS });
    return value;
  } catch {
    // Cache the miss briefly so a flaky API does not get hammered.
    cache.set(key, { value: null, expiresAt: Date.now() + FAILURE_TTL_MS });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: drop everything cached. */
export function clearWeatherCache(): void {
  cache.clear();
}
