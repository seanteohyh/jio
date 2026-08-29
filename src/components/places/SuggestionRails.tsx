"use client";

import useSWR from "swr";
import PlaceCard from "@/components/PlaceCard";
import { SectionHeading } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import type { ScoredPlace, Visit } from "@/types";

const RAIL_SIZE = 5;
const POOL_SIZE = 24;

interface SuggestResponse {
  suggestions: (ScoredPlace & { why: string })[];
}

/**
 * UX review log #6 — the two personal-suggestion rails that replace
 * /suggest as a standalone destination: "Quick & nearby" (the closest of
 * your personal top picks) and "New to try" (top picks you've never
 * personally logged a visit to — cuisine-exclude-aware, so StreakBanner's
 * "Break it" link can point here instead of the old, dead `exclude` param
 * on `/suggest`).
 *
 * Shown only on a plain, unfiltered browse — a search or an active cuisine
 * filter already narrows to intent, and stacking curated rails on top of
 * that reads as clutter, not help.
 */
export default function SuggestionRails({
  excludeCuisine,
}: {
  excludeCuisine?: string;
}) {
  const { data: suggestData } = useSWR<SuggestResponse>(
    `/api/suggest?limit=${POOL_SIZE}`,
    fetcher
  );
  const { data: visitsData } = useSWR<{ visits: Visit[] }>(
    "/api/visits",
    fetcher
  );

  if (!suggestData) return null;

  const pool = suggestData.suggestions;
  const visitedPlaceIds = new Set(
    (visitsData?.visits ?? []).map((v) => v.place_id)
  );

  const quickAndNearby = [...pool]
    .filter((s) => typeof s.place.walk_minutes === "number")
    .sort((a, b) => (a.place.walk_minutes ?? 0) - (b.place.walk_minutes ?? 0))
    .slice(0, RAIL_SIZE);

  const newToTry = pool
    .filter((s) => !visitedPlaceIds.has(s.place.id))
    .filter(
      (s) => !excludeCuisine || !s.place.cuisine.includes(excludeCuisine)
    )
    .slice(0, RAIL_SIZE);

  if (quickAndNearby.length === 0 && newToTry.length === 0) return null;

  return (
    <div className="space-y-4">
      {quickAndNearby.length > 0 && (
        <section>
          <SectionHeading>Quick &amp; nearby</SectionHeading>
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
            {quickAndNearby.map((scored) => (
              <div key={scored.place.id} className="w-64 shrink-0">
                <PlaceCard place={scored.place} why={scored.why} compact />
              </div>
            ))}
          </div>
        </section>
      )}

      {newToTry.length > 0 && (
        <section>
          <SectionHeading>New to try</SectionHeading>
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
            {newToTry.map((scored) => (
              <div key={scored.place.id} className="w-64 shrink-0">
                <PlaceCard place={scored.place} why={scored.why} compact />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
