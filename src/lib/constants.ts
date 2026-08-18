import type { BudgetTier, CuisineOption, Office } from "@/types";

/**
 * The anchor office. Overridable through env so a fork can point at a
 * different building without touching code.
 */
export const DEFAULT_OFFICE: Office = {
  id: "00000000-0000-0000-0000-000000000001",
  name: process.env.NEXT_PUBLIC_JIO_OFFICE_NAME || "LazadaOne",
  address: "51 Bras Basah Road, Singapore 189554",
  lat: Number(process.env.NEXT_PUBLIC_JIO_OFFICE_LAT || 1.297563),
  lng: Number(process.env.NEXT_PUBLIC_JIO_OFFICE_LNG || 103.85012),
};

/**
 * The 18 cuisines Jio has always shipped with — no longer the whole list.
 * CHANGES_20260818.md §6 replaced the old hardcoded `CUISINES` constant
 * with a runtime-extensible `cuisines` table (052_cuisines.sql, seeded with
 * exactly these); this is only what `demoRepo`'s in-memory store seeds
 * itself with, matching the migration's seed data one-for-one so demo mode
 * shows the same starting list as a fresh live deployment. Every other
 * caller now fetches the live list via `repo.listCuisines()` instead of
 * importing this directly.
 */
export const DEFAULT_CUISINE_SEED: Omit<CuisineOption, "added_by" | "created_at">[] = [
  { slug: "chinese", label: "Chinese" },
  { slug: "malay", label: "Malay" },
  { slug: "indian", label: "Indian" },
  { slug: "japanese", label: "Japanese" },
  { slug: "korean", label: "Korean" },
  { slug: "thai", label: "Thai" },
  { slug: "vietnamese", label: "Vietnamese" },
  { slug: "western", label: "Western" },
  { slug: "italian", label: "Italian" },
  { slug: "local", label: "Local" },
  { slug: "halal", label: "Halal" },
  { slug: "vegetarian", label: "Vegetarian" },
  { slug: "cafe", label: "Cafe" },
  { slug: "fast_food", label: "Fast Food" },
  { slug: "food_court", label: "Food Court" },
  { slug: "dessert", label: "Dessert" },
  { slug: "modern", label: "Modern" },
  { slug: "traditional", label: "Traditional" },
];

export const BUDGET_TIERS: {
  tier: BudgetTier;
  label: string;
  description: string;
}[] = [
  { tier: 1, label: "$", description: "under $8" },
  { tier: 2, label: "$$", description: "$8 – $15" },
  { tier: 3, label: "$$$", description: "$15 – $30" },
  { tier: 4, label: "$$$$", description: "over $30" },
];

/** Radius in metres used when discovering nearby POIs. */
export const WALK_RADIUS_M = 1200;

/** Assumed walking pace when no routing provider is available. */
export const WALK_SPEED_M_PER_MIN = 80;

/** Two candidates closer than this with the same name are the same place. */
export const DEDUPE_PROXIMITY_M = 25;

/**
 * How many days ahead a recurring series generates its next occurrence.
 * Long enough to leave a few days for voting, short enough that opening the
 * app doesn't spawn a Jio for a lunch three weeks out.
 */
export const RECURRING_LOOKAHEAD_DAYS = 3;

/** Fixed identity used when the app runs without real auth. */
export const DEMO_USER_ID = "00000000-0000-0000-0000-00000000demo";

export const DEMO_USER = {
  id: DEMO_USER_ID,
  email: "demo@jio.app",
  display_name: "You (demo)",
};

export function budgetLabel(tier: number): string {
  const rounded = Math.max(1, Math.min(4, Math.round(tier)));
  return "$".repeat(rounded);
}
