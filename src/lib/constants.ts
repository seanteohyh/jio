import type { BudgetTier, Cuisine, Office } from "@/types";

/**
 * The anchor office. Overridable through env so a fork can point at a
 * different building without touching code.
 */
export const DEFAULT_OFFICE: Office = {
  id: "00000000-0000-0000-0000-000000000001",
  name: process.env.NEXT_PUBLIC_JIO_OFFICE_NAME || "LazadaOne",
  address: "51 Bras Basah Road, Singapore 189554",
  lat: Number(process.env.NEXT_PUBLIC_JIO_OFFICE_LAT || 1.2966),
  lng: Number(process.env.NEXT_PUBLIC_JIO_OFFICE_LNG || 103.852),
};

export const CUISINES: Cuisine[] = [
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
  "other",
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
