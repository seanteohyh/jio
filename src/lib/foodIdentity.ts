import { formatCuisine } from "./utils";
import type {
  FoodIdentityCard,
  KakiFoodIdentityCard,
  KakiMetrics,
  UserMetrics,
} from "@/types";

/**
 * CHANGES_20260821_combined2.md Item 1 — rule-based food identity archetypes.
 * Deliberately not ML: every input already exists in `UserMetrics`, and the
 * whole point is that a person can read the rule and see why they got the
 * label they did.
 *
 * Below this many total visits, there isn't enough signal to commit to any
 * specific archetype — everyone starts at "Just getting started" instead,
 * regardless of what the other numbers happen to say about three visits'
 * worth of data.
 */
const MIN_VISITS_FOR_ARCHETYPE = 3;

/** The Loyalist: one cuisine this dominant is a real pattern, not chance. */
const LOYALIST_CUISINE_SHARE = 0.5;

/** The Explorer: distinct cuisines *tried*, not how evenly spread they are. */
const EXPLORER_CUISINE_COUNT = 6;

/** The Regular: one place taking this big a slice of all visits. */
const REGULAR_PLACE_SHARE = 0.3;

/** The Enthusiast: genuinely generous, not just "slightly positive" (which
 *  most people already are by default on a 1-5 scale). */
const ENTHUSIAST_MIN_RATING = 4.5;

/** The Connoisseur / Budget Hunter: mapped onto today's 6-tier budget scale
 *  (tiers 1-6, `BUDGET_TIERS` in constants.ts) by reading this doc's original
 *  "$$-$$$" / "$-$" wording literally against each tier's own label — tier 1
 *  is "$", tier 2 "$$", tier 3 "$$$", etc. Written before the 6-tier split
 *  (CHANGES_20260821.md §1), but the per-tier labels didn't change, so the
 *  literal reading still lines up. */
const CONNOISSEUR_TIERS = new Set([2, 3]);
const BUDGET_HUNTER_TIER = 1;

function justGettingStarted(): FoodIdentityCard {
  return {
    archetype: "just_getting_started",
    headline: "Just getting started",
    description: "Log a few more visits and your food identity shows up here.",
  };
}

/**
 * Checked in priority order, most-specific/data-rich first — this is the
 * doc's own listed order, not an arbitrary one: a dominant cuisine or place
 * is a stronger, more legible signal than an average rating or budget tier,
 * so those get first refusal.
 */
export function computeFoodIdentity(metrics: UserMetrics): FoodIdentityCard {
  if (metrics.totalVisits < MIN_VISITS_FOR_ARCHETYPE) {
    return justGettingStarted();
  }

  const cuisineEntries = Object.entries(metrics.cuisineBreakdown);
  const topCuisine = cuisineEntries.reduce<{ cuisine: string; share: number } | null>(
    (best, [cuisine, share]) =>
      !best || share > best.share ? { cuisine, share } : best,
    null
  );
  if (topCuisine && topCuisine.share >= LOYALIST_CUISINE_SHARE) {
    return {
      archetype: "loyalist",
      headline: "The Loyalist",
      description: `${formatCuisine(topCuisine.cuisine)} is basically home turf — ${Math.round(topCuisine.share * 100)}% of your visits.`,
    };
  }

  if (cuisineEntries.length >= EXPLORER_CUISINE_COUNT) {
    return {
      archetype: "explorer",
      headline: "The Explorer",
      description: `${cuisineEntries.length} cuisines tried and counting — you rarely order the same thing twice.`,
    };
  }

  const topPlace = metrics.favouritePlaces[0];
  const topPlaceShare = topPlace ? topPlace.visit_count / metrics.totalVisits : 0;
  if (topPlace && topPlaceShare >= REGULAR_PLACE_SHARE) {
    return {
      archetype: "regular",
      headline: "The Regular",
      description: `${topPlace.place_name} sees you a lot — ${topPlace.visit_count} of your last ${metrics.totalVisits} visits.`,
    };
  }

  if (metrics.avgRatingGiven >= ENTHUSIAST_MIN_RATING) {
    return {
      archetype: "enthusiast",
      headline: "The Enthusiast",
      description: `You rate generously — a ${metrics.avgRatingGiven.toFixed(1)} average across everywhere you've been.`,
    };
  }

  const roundedTier = Math.round(metrics.avgBudgetTier);
  if (CONNOISSEUR_TIERS.has(roundedTier)) {
    return {
      archetype: "connoisseur",
      headline: "The Connoisseur",
      description: `Comfortable mid-range spending — averaging ${metrics.avgBudgetLabel} a meal.`,
    };
  }
  if (roundedTier === BUDGET_HUNTER_TIER) {
    return {
      archetype: "budget_hunter",
      headline: "Budget Hunter",
      description: `Great taste, better prices — averaging ${metrics.avgBudgetLabel} a meal.`,
    };
  }

  return {
    archetype: "well_rounded",
    headline: "The Well-Rounded Eater",
    description: "A bit of everything — no single label fits you yet.",
  };
}

/**
 * Kaki-level card: one group-vibe headline (from the group's own dominant
 * cuisine and average budget), plus the two existing award slots
 * (`mostActiveMember`/`adventurer`) elevated into named celebratory slots
 * rather than left as plain stat tiles. Positive-only by design, per the
 * doc — there is no negative-framed slot at this level.
 */
/**
 * "YYYY-MM" for the calendar month immediately before `now` — the month the
 * monthly cron locks in each run. Always the *previous* month, not the one
 * still in progress: a month is only "locked" once it can no longer change,
 * and a still-running month's data keeps shifting as people log more
 * visits right up until it ends.
 */
export function previousMonthKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function computeKakiFoodIdentity(
  metrics: KakiMetrics
): KakiFoodIdentityCard {
  const cuisineEntries = Object.entries(metrics.groupCuisineBreakdown);
  const topCuisine = cuisineEntries.reduce<{ cuisine: string; share: number } | null>(
    (best, [cuisine, share]) =>
      !best || share > best.share ? { cuisine, share } : best,
    null
  );

  const headline = topCuisine
    ? `Mostly ${formatCuisine(topCuisine.cuisine)}, ${metrics.groupAvgBudgetLabel} a meal`
    : `Averaging ${metrics.groupAvgBudgetLabel} a meal`;

  return {
    headline,
    description: `${metrics.groupDistinctPlaces} place${metrics.groupDistinctPlaces === 1 ? "" : "s"} tried together across ${metrics.groupTotalVisits} visit${metrics.groupTotalVisits === 1 ? "" : "s"}.`,
    mostActive: metrics.mostActiveMember,
    adventurer: metrics.adventurer,
  };
}
