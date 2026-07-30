/**
 * Feature flags.
 *
 * Every optional slice of Jio is listed here. Turning one off hides its
 * navigation entries and makes its API routes return 404, so you can ship a
 * stripped-down build without deleting code.
 *
 * Disable features with a comma-separated env var:
 *   NEXT_PUBLIC_JIO_DISABLED_FEATURES=kakis,blogImport
 *
 * The var must be read statically (not via a computed key) so that Next.js can
 * inline it into the client bundle.
 */

export const FEATURE_KEYS = [
  "events",
  "kakis",
  "wishlist",
  "recos",
  "lobangs",
  "blogImport",
  "discovery",
  "weather",
  "map",
  "metrics",
  "roulette",
  "reviews",
  "offices",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const rawDisabled = process.env.NEXT_PUBLIC_JIO_DISABLED_FEATURES || "";

const disabled = new Set(
  rawDisabled
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

export const features: Record<FeatureKey, boolean> = FEATURE_KEYS.reduce(
  (acc, key) => {
    acc[key] = !disabled.has(key);
    return acc;
  },
  {} as Record<FeatureKey, boolean>
);

export function isEnabled(key: FeatureKey): boolean {
  return features[key];
}

/**
 * Throw-style guard for API routes. Returns a 404 Response when the feature is
 * off, or `null` when it is on.
 */
export function featureGate(key: FeatureKey): Response | null {
  if (isEnabled(key)) return null;
  return new Response(
    JSON.stringify({ error: `Feature "${key}" is disabled` }),
    { status: 404, headers: { "Content-Type": "application/json" } }
  );
}
