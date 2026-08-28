"use client";

import { formatCuisine, formatMonthKey } from "@/lib/utils";
import { Star } from "lucide-react";
import { Card, EmptyState, LinkButton, SectionHeading } from "./ui";
import type { KakiMetrics, UserMetrics } from "@/types";

/**
 * Metrics, drawn with divs.
 *
 * A charting library would be several hundred kilobytes to render a handful of
 * horizontal bars. These are proportional widths on styled elements, which
 * costs nothing, works without JavaScript once rendered, and is readable by a
 * screen reader because the numbers are actually in the text.
 */

const BAR_COLORS = [
  "#b4532f",
  "#567b57",
  "#a87b2d",
  "#6b6091",
  "#3f6b78",
  "#8c4a52",
  "#427a70",
];

function CuisineBars({
  breakdown,
  title,
}: {
  breakdown: Record<string, number>;
  title: string;
}) {
  const entries = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  if (entries.length === 0) return null;

  const max = entries[0][1] || 1;

  return (
    <Card>
      <SectionHeading>{title}</SectionHeading>
      <ul className="space-y-2">
        {entries.map(([cuisine, share], index) => (
          <li key={cuisine} className="flex items-center gap-3 text-xs">
            <span className="text-stone w-24 shrink-0 truncate">
              {formatCuisine(cuisine)}
            </span>
            <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(3, (share / max) * 100)}%`,
                  backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                }}
              />
            </span>
            <span className="text-stone w-10 shrink-0 text-right tabular-nums">
              {Math.round(share * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="border-line bg-cream/60 rounded-xl border p-3">
      <p className="text-ink text-xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-stone mt-0.5 text-xs">{label}</p>
      {sub && <p className="text-stone mt-0.5 text-[11px]">{sub}</p>}
    </div>
  );
}

export function UserMetricsCharts({ metrics }: { metrics: UserMetrics }) {
  if (metrics.totalVisits === 0) {
    return (
      <EmptyState
        title="No visits logged yet"
        description="Log a few visits and your stats will show up here."
        action={<LinkButton href="/places">Browse places</LinkButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Visits logged" value={metrics.totalVisits} />
        <StatTile label="Different places" value={metrics.distinctPlaces} />
        <StatTile
          label="Average rating"
          value={metrics.avgRatingGiven.toFixed(1)}
          sub="that you gave"
        />
        <StatTile
          label="Usual spend"
          value={metrics.avgBudgetLabel}
          sub={`${metrics.currentVariety} places in 30 days`}
        />
      </div>

      {metrics.mostActiveMonth && (
        <p className="text-stone text-xs">
          Busiest month: {formatMonthKey(metrics.mostActiveMonth)}
        </p>
      )}

      <CuisineBars
        breakdown={metrics.cuisineBreakdown}
        title="What you actually eat"
      />

      {metrics.favouritePlaces.length > 0 && (
        <Card>
          <SectionHeading>Your regulars</SectionHeading>
          <ol className="space-y-1.5">
            {metrics.favouritePlaces.map((fav, index) => (
              <li
                key={fav.place_id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  <span className="text-stone mr-2 text-xs">
                    {index + 1}
                  </span>
                  {fav.place_name}
                </span>
                <span className="text-stone shrink-0 text-xs tabular-nums">
                  {fav.visit_count} visits · {fav.avg_rating.toFixed(1)}
                  <Star className="ml-0.5 inline h-3 w-3 align-[-1px]" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

export function KakiMetricsCharts({ metrics }: { metrics: KakiMetrics }) {
  if (metrics.groupTotalVisits === 0) {
    return (
      <EmptyState
        title="No visits yet"
        description="Nobody in this group has logged a visit yet — once someone does, stats show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* "Most active" and "Adventurer" used to live here as plain stat
          tiles — CHANGES_20260821_combined2.md Item 1 elevates them into
          named celebratory slots on `KakiFoodIdentityCard` instead,
          rendered by the Kaki page alongside this component. */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Group visits" value={metrics.groupTotalVisits} />
        <StatTile label="Places tried" value={metrics.groupDistinctPlaces} />
      </div>

      <CuisineBars
        breakdown={metrics.groupCuisineBreakdown}
        title="What the group eats"
      />

      {metrics.groupFavouritePlaces.length > 0 && (
        <Card>
          <SectionHeading>Group favourites</SectionHeading>
          <p className="text-stone mb-2 text-xs">
            Ranked by how many members have been, not by raw visit count.
          </p>
          <ol className="space-y-1.5">
            {metrics.groupFavouritePlaces.map((fav, index) => (
              <li
                key={fav.place_id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  <span className="text-stone mr-2 text-xs">
                    {index + 1}
                  </span>
                  {fav.place_name}
                </span>
                <span className="text-stone shrink-0 text-xs tabular-nums">
                  {fav.visit_count} visits · {fav.avg_rating.toFixed(1)}
                  <Star className="ml-0.5 inline h-3 w-3 align-[-1px]" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
