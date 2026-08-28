"use client";

import useSWR from "swr";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import { WishlistSection } from "@/components/admin/AdminAnalyticsCharts";
import { useAnalyticsDays } from "@/components/admin/AdminDateRangePicker";
import { fetcher } from "@/lib/fetcher";
import type { AdminAnalytics } from "@/types";

export default function AdminAnalyticsWishlistPage() {
  const days = useAnalyticsDays();
  const { data, error, isLoading } = useSWR<{ analytics: AdminAnalytics }>(
    `/api/admin/analytics?days=${days}`,
    fetcher
  );

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (isLoading) return <SkeletonDetail />;
  if (!data?.analytics) return null;

  return (
    <WishlistSection
      wishlist={data.analytics.wishlist}
      windowDays={data.analytics.windowDays}
    />
  );
}
