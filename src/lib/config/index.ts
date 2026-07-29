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
export type AuthAdapter = "demo" | "supabase";
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

  /** Which auth implementation `getAuth()` returns. */
  authAdapter: pick<AuthAdapter>(
    process.env.JIO_AUTH_ADAPTER,
    ["demo", "supabase"],
    () => (isDemoMode() ? "demo" : "supabase")
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

  /** Sign-in methods the login page offers. */
  authMethods: (
    process.env.NEXT_PUBLIC_JIO_AUTH_METHODS || "magiclink,otp"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ("magiclink" | "otp" | "password")[],

  /** When false, only existing users can sign in. */
  openSignup: process.env.NEXT_PUBLIC_JIO_OPEN_SIGNUP !== "false",

  overpassUrl:
    process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",

  isDemo: isDemoMode(),
} as const;

export type AppConfig = typeof config;
