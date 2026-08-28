"use client";

import useSWR from "swr";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import { PerformanceSection } from "@/components/admin/AdminAnalyticsCharts";
import { fetcher } from "@/lib/fetcher";
import type { AdminAnalytics } from "@/types";

export default function AdminAnalyticsPerformancePage() {
  const { data, error, isLoading } = useSWR<{ analytics: AdminAnalytics }>(
    "/api/admin/analytics?days=90",
    fetcher
  );

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (isLoading) return <SkeletonDetail />;
  if (!data?.analytics) return null;

  return (
    <PerformanceSection
      performance={data.analytics.performance}
      windowDays={data.analytics.windowDays}
    />
  );
}
