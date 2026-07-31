"use client";

import Link from "next/link";
import { ArrowRight, Footprints } from "lucide-react";
import { BudgetBadge, Stars, TintPill } from "./ui";
import { cn, formatCuisine } from "@/lib/utils";
import type { Place } from "@/types";

/**
 * One place, as it appears in every list in the app.
 *
 * `why` is the recommender's reason for surfacing this place. Showing it turns
 * the ranking from a black box into something arguable — which matters, because
 * a suggestion you can disagree with is one you can trust.
 */
export default function PlaceCard({
  place,
  why,
  rank,
  action,
  compact,
}: {
  place: Place;
  why?: string;
  rank?: number;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-line bg-cream/60 hover:border-ember/40 rounded-xl border transition-colors",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex items-start gap-3">
        {typeof rank === "number" && (
          <span className="bg-ember-tint text-ember mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/places/${place.id}`}
              className="text-ink hover:text-ember truncate font-medium"
            >
              {place.name}
            </Link>
            {action}
          </div>

          {/* Cuisine, budget, walk time — one tinted row, the shape the brand
              leads with. Rating and visit count stay plain text so the row
              does not turn into a wall of colour. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {place.cuisine.slice(0, compact ? 2 : 3).map((cuisine) => (
              <TintPill key={cuisine} tone="cuisine">
                {formatCuisine(cuisine)}
              </TintPill>
            ))}
            <BudgetBadge tier={place.budget_tier} />
            {typeof place.walk_minutes === "number" && (
              <TintPill tone="walk">
                <Footprints className="h-3 w-3" aria-hidden="true" />
                {place.walk_minutes} min
              </TintPill>
            )}
          </div>

          {(typeof place.avg_rating === "number" || place.visit_count) && (
            <div className="text-stone mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {typeof place.avg_rating === "number" && (
                <Stars rating={place.avg_rating} />
              )}
              {place.visit_count ? (
                <span>
                  {place.visit_count} visit{place.visit_count === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          )}

          {why && (
            <p className="text-ember mt-2 text-xs">
              <ArrowRight className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
              {why}
            </p>
          )}

          {!compact && place.best_dishes.length > 0 && (
            <p className="text-stone mt-2 truncate text-xs">
              Try: {place.best_dishes.slice(0, 3).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
