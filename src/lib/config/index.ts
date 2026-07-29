import { isDemoMode } from "@/lib/utils";
import { features, isEnabled, featureGate } from "./features";
import type { FeatureKey } from "./features";

export { features, isEnabled, featureGate };
export type { FeatureKey };
export { FEATURE_KEYS } from "./features";

/**
 * Single place where the app decides *which implementation* backs each seam.
 *
 * Every adapter answers to an interface, so swapping one is a matter of adding
 * an implementation file and a case in the relevant factory — never a change to
 * a page or an API route.
 */

export type DataAdapter = "demo" | "supabase";

/**
 * Auth modes, cheapest first.
 *
 *  demo  — everyone is the same fixed user. No sign-in at all.
 *  name  — type your name, that's it. Identity is a Supabase anonymous
 *          session, so it is a real distinct user with a real UUID and Row
 *          Level Security still applies. No email, no password, no provider.
 *  email — passwordless magic link plus a 6-digit code.
 *
 * `name` is the default outside demo mode: it is the least ceremony that still
 * gives distinct, attributable users.
 */
export type AuthAdapter = "demo" | "name" | "email";
export type RoutingProviderName = "onemap" | "haversine";
export type WeatherProviderName = "nea" | "none";
export type DiscoveryProviderName = "overpass" | "none";

function pick<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  auto: () => T
): T {
  const value = (raw || "auto").trim().toLowerCase();
  if (value === "auto" || value === "") return auto();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  return auto();
}

const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const hasOneMap = Boolean(
  process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD
);

export const config = {
  appName: process.env.NEXT_PUBLIC_JIO_APP_NAME || "Jio",

  /** Which repository implementation `getRepoAsync()` returns. */
  dataAdapter: pick<DataAdapter>(
    process.env.JIO_DATA_ADAPTER,
    ["demo", "supabase"],
    () => (isDemoMode() ? "demo" : "supabase")
  ),

  /**
   * Which auth implementation `getAuth()` returns.
   *
   * Deliberately NEXT_PUBLIC_: the login page is a client component and has to
   * know which form to render. A server-only var would read as undefined in
   * the browser and silently fall back to the wrong mode.
   */
  authAdapter: pick<AuthAdapter>(
    process.env.NEXT_PUBLIC_JIO_AUTH_ADAPTER,
    ["demo", "name", "email"],
    () => (isDemoMode() ? "demo" : "name")
  ),

  /** Which walking-route provider to use. */
  routingProvider: pick<RoutingProviderName>(
    process.env.JIO_ROUTING_PROVIDER,
    ["onemap", "haversine"],
    () => (hasOneMap ? "onemap" : "haversine")
  ),

  weatherProvider: pick<WeatherProviderName>(
    process.env.JIO_WEATHER_PROVIDER,
    ["nea", "none"],
    () => (isEnabled("weather") ? "nea" : "none")
  ),

  discoveryProvider: pick<DiscoveryProviderName>(
    process.env.JIO_DISCOVERY_PROVIDER,
    ["overpass", "none"],
    () => (isEnabled("discovery") ? "overpass" : "none")
  ),

  /** When false, only existing users can sign in. Only meaningful in email mode. */
  openSignup: process.env.NEXT_PUBLIC_JIO_OPEN_SIGNUP !== "false",

  overpassUrl:
    process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",

  isDemo: isDemoMode(),
} as const;

export type AppConfig = typeof config;
