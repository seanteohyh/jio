"use client";

import useSWR from "swr";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import {
  FunnelSection,
  GrowthSection,
  JioOutcomesSection,
} from "@/components/admin/AdminAnalyticsCharts";
import { fetcher } from "@/lib/fetcher";
import type { AdminAnalytics } from "@/types";

/** Overview — the three sections every other view builds on: today's
 *  funnel, growth over the window, and how Jios have been resolving. */
export default function AdminAnalyticsOverviewPage() {
  const { data, error, isLoading } = useSWR<{ analytics: AdminAnalytics }>(
    "/api/admin/analytics?days=90",
    fetcher
  );

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (isLoading) return <SkeletonDetail />;
  if (!data?.analytics) return null;

  return (
    <>
      <FunnelSection funnel={data.analytics.funnel} />
      <GrowthSection
        growth={data.analytics.growth}
        windowDays={data.analytics.windowDays}
      />
      <JioOutcomesSection outcomes={data.analytics.jioOutcomes} />
    </>
  );
}
