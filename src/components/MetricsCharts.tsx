"use client";

import { formatCuisine, formatMonthKey } from "@/lib/utils";
import { Card, SectionHeading } from "./ui";
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
            <span className="text-dolch-muted w-24 shrink-0 truncate">
              {formatCuisine(cuisine)}
            </span>
            <span className="bg-dolch-bg h-3 flex-1 overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(3, (share / max) * 100)}%`,
                  backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                }}
              />
            </span>
            <span className="text-dolch-muted w-10 shrink-0 text-right tabular-nums">
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
    <div className="border-dolch-border bg-dolch-surface/60 rounded-xl border p-3">
      <p className="text-dolch-text text-xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-dolch-muted mt-0.5 text-xs">{label}</p>
      {sub && <p className="text-dolch-muted mt-0.5 text-[11px]">{sub}</p>}
    </div>
  );
}

export function UserMetricsCharts({ metrics }: { metrics: UserMetrics }) {
  if (metrics.totalVisits === 0) {
    return (
      <p className="text-dolch-muted text-sm">
        Log a few visits and your stats will show up here.
      </p>
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
        <p className="text-dolch-muted text-xs">
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
                  <span className="text-dolch-muted mr-2 text-xs">
                    {index + 1}
                  </span>
                  {fav.place_name}
                </span>
                <span className="text-dolch-muted shrink-0 text-xs tabular-nums">
                  {fav.visit_count}× · {fav.avg_rating.toFixed(1)}★
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

export function KakiMetricsCharts({
  metrics,
  nameFor,
}: {
  metrics: KakiMetrics;
  nameFor: (userId: string) => string;
}) {
  if (metrics.groupTotalVisits === 0) {
    return (
      <p className="text-dolch-muted text-sm">
        Nobody in this group has logged a visit yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Group visits" value={metrics.groupTotalVisits} />
        <StatTile label="Places tried" value={metrics.groupDistinctPlaces} />
        <StatTile
          label="Most active"
          value={
            metrics.mostActiveMember
              ? nameFor(metrics.mostActiveMember.user_id)
              : "—"
          }
          sub={
            metrics.mostActiveMember
              ? `${metrics.mostActiveMember.visits} visits`
              : undefined
          }
        />
        <StatTile
          label="Adventurer"
          value={metrics.adventurer ? nameFor(metrics.adventurer.user_id) : "—"}
          sub={
            metrics.adventurer
              ? `${metrics.adventurer.distinctPlaces} different places`
              : undefined
          }
        />
      </div>

      <CuisineBars
        breakdown={metrics.groupCuisineBreakdown}
        title="What the group eats"
      />

      {metrics.groupFavouritePlaces.length > 0 && (
        <Card>
          <SectionHeading>Group favourites</SectionHeading>
          <p className="text-dolch-muted mb-2 text-xs">
            Ranked by how many members have been, not by raw visit count.
          </p>
          <ol className="space-y-1.5">
            {metrics.groupFavouritePlaces.map((fav, index) => (
              <li
                key={fav.place_id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  <span className="text-dolch-muted mr-2 text-xs">
                    {index + 1}
                  </span>
                  {fav.place_name}
                </span>
                <span className="text-dolch-muted shrink-0 text-xs tabular-nums">
                  {fav.visit_count}× · {fav.avg_rating.toFixed(1)}★
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
