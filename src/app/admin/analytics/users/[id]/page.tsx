"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card, EmptyState, ErrorNote, SectionHeading, SkeletonDetail } from "@/components/ui";
import { DistributionBars, RankedList, StatTile } from "@/components/admin/AdminAnalyticsCharts";
import { fetcher } from "@/lib/fetcher";
import { formatCuisine, formatMonthKey } from "@/lib/utils";
import type { AdminUserDetail } from "@/types";

/**
 * Part 1 §B — the Users view's per-person drill-down. Reuses
 * `computeUserMetrics` (via the API route) pointed at one target rather
 * than "the logged-in user," plus admin-only context alongside it.
 *
 * Deliberate, documented privacy debt (source doc §2): this shows full
 * visit detail regardless of `is_public`, not an aggregate-only summary —
 * worth tightening once more admins are added. See `AdminUserDetail`'s doc
 * comment in src/types/index.ts.
 */
export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<{ detail: AdminUserDetail }>(
    `/api/admin/analytics/users/${id}`,
    fetcher
  );

  if (error) {
    if (error.message?.includes("not found")) {
      return (
        <EmptyState
          title="Person not found"
          description="Their account may have been removed or merged."
          action={
            <Link href="/admin/analytics/users" className="text-ember text-sm underline">
              ← Back to Users
            </Link>
          }
        />
      );
    }
    return <ErrorNote>{error.message}</ErrorNote>;
  }
  if (isLoading) return <SkeletonDetail />;
  if (!data?.detail) return null;

  const { detail } = data;
  const { metrics } = detail;

  return (
    <div className="space-y-4">
      <Link href="/admin/analytics/users" className="text-ember text-sm underline">
        ← Back to Users
      </Link>

      <Card>
        <SectionHeading>{detail.name}</SectionHeading>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Jios hosted" value={detail.hostedCount} />
          <StatTile label="Kaki groups" value={detail.kakiMemberships.length} />
          <StatTile label="Lobangs sent" value={detail.lobangsSent} />
          <StatTile label="Lobangs received" value={detail.lobangsReceived} />
          <StatTile
            label="RSVP responsiveness"
            value={
              detail.rsvpResponsivenessPct === null
                ? "—"
                : `${detail.rsvpResponsivenessPct}%`
            }
            sub="of invites, lifetime"
          />
          <StatTile
            label="Last active"
            value={
              detail.lastActiveAt
                ? new Date(detail.lastActiveAt).toLocaleDateString()
                : "Never"
            }
          />
        </div>
        {detail.kakiMemberships.length > 0 && (
          <p className="text-stone mt-2 text-xs">
            Kaki groups: {detail.kakiMemberships.map((k) => k.name).join(", ")}
          </p>
        )}
      </Card>

      {metrics.totalVisits === 0 ? (
        <EmptyState
          title="No visits logged"
          description="This person hasn't logged a single visit yet."
        />
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Visits logged" value={metrics.totalVisits} />
            <StatTile label="Different places" value={metrics.distinctPlaces} />
            <StatTile
              label="Average rating given"
              value={metrics.avgRatingGiven.toFixed(1)}
            />
            <StatTile
              label="Usual spend"
              value={metrics.avgBudgetLabel}
              sub={`${metrics.currentVariety} places in 30 days`}
            />
          </Card>

          {metrics.mostActiveMonth && (
            <p className="text-stone text-xs">
              Busiest month: {formatMonthKey(metrics.mostActiveMonth)}
            </p>
          )}

          <Card>
            <SectionHeading>Cuisine breakdown</SectionHeading>
            <p className="text-stone mb-2 text-xs">
              Share of visits, as whole percentage points — `computeUserMetrics`
              itself returns a 0-1 fraction per cuisine, not a raw count.
            </p>
            <DistributionBars
              entries={Object.entries(metrics.cuisineBreakdown)
                .map(([cuisine, share]) => [cuisine, Math.round(share * 100)] as [string, number])
                .sort((a, b) => b[1] - a[1])}
              formatLabel={formatCuisine}
              formatValue={(v) => `${v}%`}
              total={100}
            />
          </Card>

          {metrics.favouritePlaces.length > 0 && (
            <Card>
              <SectionHeading>Regulars</SectionHeading>
              <RankedList
                items={metrics.favouritePlaces.map((fav) => ({
                  id: fav.place_id,
                  name: fav.place_name,
                  count: fav.visit_count,
                }))}
                formatValue={(item) => {
                  const fav = metrics.favouritePlaces.find(
                    (f) => f.place_id === item.id
                  )!;
                  return `${item.count} visits · ${fav.avg_rating.toFixed(1)}`;
                }}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
