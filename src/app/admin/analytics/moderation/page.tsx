"use client";

import useSWR from "swr";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import { ModerationSection } from "@/components/admin/AdminAnalyticsCharts";
import { fetcher } from "@/lib/fetcher";
import type { AdminAnalytics } from "@/types";

export default function AdminAnalyticsModerationPage() {
  const { data, error, isLoading } = useSWR<{ analytics: AdminAnalytics }>(
    "/api/admin/analytics?days=90",
    fetcher
  );

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (isLoading) return <SkeletonDetail />;
  if (!data?.analytics) return null;

  return (
    <ModerationSection
      moderation={data.analytics.moderation}
      windowDays={data.analytics.windowDays}
    />
  );
}
