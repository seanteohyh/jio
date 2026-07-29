"use client";

import Link from "next/link";
import { BudgetBadge, Chip, Stars } from "./ui";
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
        "border-dolch-border bg-dolch-surface/60 hover:border-dolch-accent/40 rounded-xl border transition-colors",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex items-start gap-3">
        {typeof rank === "number" && (
          <span className="bg-dolch-accent-soft text-dolch-accent mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/places/${place.id}`}
              className="text-dolch-text hover:text-dolch-accent truncate font-medium"
            >
              {place.name}
            </Link>
            {action}
          </div>

          <div className="text-dolch-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {typeof place.walk_minutes === "number" && (
              <span>{place.walk_minutes} min walk</span>
            )}
            <BudgetBadge tier={place.budget_tier} />
            {typeof place.avg_rating === "number" && (
              <Stars rating={place.avg_rating} />
            )}
            {place.visit_count ? (
              <span>
                {place.visit_count} visit{place.visit_count === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {!compact && place.cuisine.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {place.cuisine.slice(0, 4).map((cuisine) => (
                <Chip key={cuisine}>{formatCuisine(cuisine)}</Chip>
              ))}
            </div>
          )}

          {why && (
            <p className="text-dolch-accent mt-2 text-xs">
              <span aria-hidden="true">→ </span>
              {why}
            </p>
          )}

          {!compact && place.best_dishes.length > 0 && (
            <p className="text-dolch-muted mt-2 truncate text-xs">
              Try: {place.best_dishes.slice(0, 3).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
