"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ShareNodesIcon } from "@/components/icons";
import ShareFoodIdentityCard from "@/components/ShareFoodIdentityCard";
import { formatCuisine, formatMonthKey } from "@/lib/utils";
import type { KakiFoodIdentitySnapshot, KakiMetrics } from "@/types";

/**
 * UX review log #24 — one new narrated sentence, built only from fields the
 * app already computes: the top cuisine and its share, and the top
 * favourite place's visit count and rating. No new data invented.
 */
export function narrateVibe(metrics: KakiMetrics): string | null {
  const [topCuisine, topShare] =
    Object.entries(metrics.groupCuisineBreakdown).sort((a, b) => b[1] - a[1])[0] ?? [];
  const topFav = metrics.groupFavouritePlaces[0];

  if (topCuisine && topFav) {
    return `${Math.round(topShare * 100)}% ${formatCuisine(topCuisine)}, and everyone keeps coming back to ${topFav.place_name} — ${topFav.visit_count} visit${topFav.visit_count === 1 ? "" : "s"} at ${topFav.avg_rating.toFixed(1)}★.`;
  }
  if (topCuisine) {
    return `${Math.round(topShare * 100)}% ${formatCuisine(topCuisine)} — this group knows what it likes.`;
  }
  if (topFav) {
    return `Everyone keeps coming back to ${topFav.place_name} — ${topFav.visit_count} visit${topFav.visit_count === 1 ? "" : "s"} at ${topFav.avg_rating.toFixed(1)}★.`;
  }
  return null;
}

/**
 * CHANGES_20260821_combined2.md Item 1 — replaces the "Most active" and
 * "Adventurer" stat tiles that used to sit in `KakiMetricsCharts`'s grid:
 * same two award slots, elevated into named celebratory rows on a card of
 * their own rather than left as plain numbers. Positive-only by design,
 * matching the doc — there is no negative-framed slot at this level.
 * `snapshot` is `null` until the cron has run at least once for this group.
 */
export default function KakiFoodIdentityCard({
  snapshot,
  nameFor,
  metrics,
}: {
  snapshot: KakiFoodIdentitySnapshot | null;
  nameFor: (userId: string) => string;
  metrics: KakiMetrics;
}) {
  const vibeSentence = narrateVibe(metrics);
  const [sharing, setSharing] = useState(false);

  if (!snapshot) {
    return (
      <Card className="border-ember/30 bg-ember-tint/40">
        <p className="text-ink text-sm font-medium">This group's vibe</p>
        <p className="text-stone mt-1 text-xs">
          Locks in early next month, once the group's logged a few visits.
        </p>
      </Card>
    );
  }

  const awards = [
    snapshot.mostActive && {
      label: "Most active",
      value: nameFor(snapshot.mostActive.user_id),
      sub: `${snapshot.mostActive.visits} visits`,
    },
    snapshot.adventurer && {
      label: "Adventurer",
      value: nameFor(snapshot.adventurer.user_id),
      sub: `${snapshot.adventurer.distinctPlaces} different places`,
    },
  ].filter((a): a is { label: string; value: string; sub: string } => Boolean(a));

  return (
    <Card className="border-ember/30 bg-ember-tint/40 space-y-2">
      <p className="text-stone text-xs font-semibold tracking-wide uppercase">
        This group's vibe · {formatMonthKey(snapshot.month)}
      </p>
      <p className="font-display text-ink text-2xl font-bold tracking-tight">
        {snapshot.headline}
      </p>
      <p className="text-stone text-sm">{snapshot.description}</p>
      {vibeSentence && <p className="text-ink text-sm">{vibeSentence}</p>}

      {awards.length > 0 && (
        <div className="border-line grid grid-cols-2 gap-3 border-t pt-3">
          {awards.map((award) => (
            <div key={award.label}>
              <p className="text-stone text-[11px] font-semibold tracking-wide uppercase">
                {award.label}
              </p>
              <p className="text-ink text-sm font-semibold">{award.value}</p>
              <p className="text-stone text-xs">{award.sub}</p>
            </div>
          ))}
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setSharing((prev) => !prev)}
      >
        {!sharing && (
          <ShareNodesIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        {sharing ? "Hide share card" : "Share"}
      </Button>

      {sharing && (
        <ShareFoodIdentityCard
          eyebrow="THIS GROUP'S VIBE"
          headline={snapshot.headline}
          description={snapshot.description}
          monthLabel={formatMonthKey(snapshot.month)}
          awards={awards}
        />
      )}
    </Card>
  );
}
