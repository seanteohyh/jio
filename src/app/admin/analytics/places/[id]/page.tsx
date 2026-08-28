"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card, EmptyState, ErrorNote, SectionHeading, SkeletonDetail } from "@/components/ui";
import { RankedList, RatingTrend, StatTile } from "@/components/admin/AdminAnalyticsCharts";
import { fetcher } from "@/lib/fetcher";
import type { AdminPlaceDetail } from "@/types";

/** Part 1 §C — the Places view's click-through drill-down: who's been,
 *  how the rating's trended over time (not just the single current
 *  average), and how well this place's cuisine/budget lines up with the
 *  people who actually go there. */
export default function AdminPlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<{ detail: AdminPlaceDetail }>(
    `/api/admin/analytics/places/${id}`,
    fetcher
  );

  if (error) {
    if (error.message?.includes("not found")) {
      return (
        <EmptyState
          title="Place not found"
          description="It may have been removed."
          action={
            <Link href="/admin/analytics/places" className="text-ember text-sm underline">
              ← Back to Places
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

  return (
    <div className="space-y-4">
      <Link href="/admin/analytics/places" className="text-ember text-sm underline">
        ← Back to Places
      </Link>

      <Card className="grid grid-cols-2 gap-3">
        <StatTile label="Wishlist saves" value={detail.wishlistSaveCount} />
        <StatTile label="Lobang mentions" value={detail.lobangMentionCount} />
        <StatTile
          label="Cuisine match"
          value={
            detail.cuisineAlignmentPct === null ? "—" : `${detail.cuisineAlignmentPct}%`
          }
          sub="of visitors with a cuisine preference"
        />
        <StatTile
          label="Budget match"
          value={
            detail.budgetAlignmentPct === null ? "—" : `${detail.budgetAlignmentPct}%`
          }
          sub="of visitors whose range fits"
        />
      </Card>

      <Card className="space-y-2">
        <SectionHeading>Rating trend</SectionHeading>
        <p className="text-stone text-xs">
          Weekly average, not just the single current figure — only weeks
          with at least one rated visit appear.
        </p>
        <RatingTrend data={detail.ratingTrend} />
      </Card>

      <Card>
        <SectionHeading>Visitors</SectionHeading>
        <RankedList items={detail.visitors} suffix=" visits" />
      </Card>
    </div>
  );
}
