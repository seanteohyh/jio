"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Card,
  Chip,
  EmptyState,
  SectionHeading,
  SkeletonDetail,
  Stars,
} from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import BudgetTierInsights, {
  emptyMetrics,
} from "@/components/profile/BudgetTierInsights";
import { formatDate, formatMonthKey, groupBy } from "@/lib/utils";
import type { UserMetrics, Visit } from "@/types";

type ViewMode = "date" | "places" | "ratings" | "spend";

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "date", label: "By date" },
  { key: "places", label: "By place" },
  { key: "ratings", label: "Ratings" },
  { key: "spend", label: "Spend" },
];

function isViewMode(value: string | null): value is ViewMode {
  return value === "date" || value === "places" || value === "ratings" || value === "spend";
}

function DateView({ visits }: { visits: Visit[] }) {
  const byMonth = groupBy(visits, (v) => v.visited_at.slice(0, 7));
  const months = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));

  if (visits.length === 0) {
    return (
      <EmptyState
        title="No visits logged yet"
        description="Log a few visits and they'll show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {months.map((month) => (
        <div key={month}>
          <p className="text-stone mb-1.5 text-xs font-medium">
            {formatMonthKey(month)}
          </p>
          <ul className="space-y-1">
            {(byMonth.get(month) ?? []).map((visit) => (
              <li
                key={visit.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <Link
                  href={`/places/${visit.place_id}`}
                  className="truncate hover:underline"
                >
                  {visit.place_name ?? "A place"}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <Stars rating={visit.rating} />
                  <span className="text-stone text-xs">
                    {formatDate(visit.visited_at)}
                  </span>
                  <Link
                    href={`/places/${visit.place_id}?editVisit=${visit.id}`}
                    className="text-ember text-xs underline"
                  >
                    Edit
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PlacesView({ visits }: { visits: Visit[] }) {
  const byPlace = groupBy(visits, (v) => v.place_id);
  const rows = Array.from(byPlace.entries())
    .map(([placeId, placeVisits]) => {
      const ratings = placeVisits
        .map((v) => v.rating)
        .filter((r): r is number => typeof r === "number");
      return {
        placeId,
        placeName: placeVisits[0]?.place_name ?? "A place",
        count: placeVisits.length,
        avgRating:
          ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.placeName.localeCompare(b.placeName));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No places yet"
        description="Log a few visits and they'll show up here."
      />
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li
          key={row.placeId}
          className="border-line flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-none"
        >
          <Link href={`/places/${row.placeId}`} className="truncate hover:underline">
            {row.placeName}
          </Link>
          <span className="text-stone shrink-0 text-xs tabular-nums">
            {row.count} visit{row.count === 1 ? "" : "s"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RatingsView({ metrics }: { metrics: UserMetrics }) {
  if (metrics.totalVisits === 0) {
    return (
      <EmptyState
        title="No ratings yet"
        description="Rate a visit and your breakdown will show up here."
      />
    );
  }

  const total = Object.values(metrics.ratingHistogram).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(metrics.ratingHistogram));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="border-line bg-cream/60 rounded-xl border p-3">
          <p className="text-ink text-xl font-semibold tabular-nums">
            {metrics.avgRatingGiven.toFixed(1)}
          </p>
          <p className="text-stone mt-0.5 text-xs">Average, across {total} ratings</p>
        </div>
        <div className="border-line bg-cream/60 rounded-xl border p-3">
          <p className="text-ink text-xl font-semibold tabular-nums">
            {metrics.ratingHistogram[5] ?? 0}
          </p>
          <p className="text-stone mt-0.5 text-xs">Rated 5 stars</p>
        </div>
      </div>

      <Card>
        <SectionHeading>Rating breakdown</SectionHeading>
        <ul className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = metrics.ratingHistogram[star] ?? 0;
            return (
              <li key={star} className="flex items-center gap-3 text-xs">
                <span className="text-amber-text w-14 shrink-0 tracking-wide">
                  {"★".repeat(star)}
                  <span className="text-line">{"★".repeat(5 - star)}</span>
                </span>
                <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-sage block h-full rounded-full"
                    style={{ width: `${Math.max(count > 0 ? 3 : 0, (count / max) * 100)}%` }}
                  />
                </span>
                <span className="text-stone w-6 shrink-0 text-right tabular-nums">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function VisitsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const view: ViewMode = isViewMode(rawView) ? rawView : "date";

  const { data: visitsData, isLoading: visitsLoading } = useSWR<{ visits: Visit[] }>(
    "/api/visits",
    fetcher
  );
  const { data: metricsData, isLoading: metricsLoading } = useSWR<{ user: UserMetrics }>(
    "/api/metrics",
    fetcher
  );

  const visits = visitsData?.visits ?? [];
  const needsMetrics = view === "ratings" || view === "spend";
  const isLoading = needsMetrics ? metricsLoading : visitsLoading;

  return (
    <div className="animate-fade-in space-y-4">
      <Link href="/profile" className="text-ember text-sm underline">
        ← Back to You
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Visits &middot; {visits.length}
        </h1>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <Chip
            key={v.key}
            active={view === v.key}
            pressed={view === v.key}
            onClick={() => router.replace(`/profile/visits?view=${v.key}`)}
          >
            {v.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <SkeletonDetail />
      ) : view === "date" ? (
        <DateView visits={visits} />
      ) : view === "places" ? (
        <PlacesView visits={visits} />
      ) : view === "ratings" ? (
        <RatingsView metrics={metricsData?.user ?? emptyMetrics()} />
      ) : (
        <BudgetTierInsights metrics={metricsData?.user ?? emptyMetrics()} />
      )}
    </div>
  );
}

export default function ProfileVisitsPage() {
  return (
    <Suspense fallback={<SkeletonDetail />}>
      <VisitsPageInner />
    </Suspense>
  );
}
