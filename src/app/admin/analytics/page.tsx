"use client";

import useSWR from "swr";
import { EmptyState, ErrorNote, SkeletonDetail } from "@/components/ui";
import {
  ContentSection,
  FunnelSection,
  GrowthSection,
  JioOutcomesSection,
  ModerationSection,
  PerformanceSection,
  SocialSection,
  WishlistSection,
} from "@/components/admin/AdminAnalyticsCharts";
import { fetcher } from "@/lib/fetcher";
import type { AdminAnalytics, AuthUser } from "@/types";

interface MeResponse {
  user: (AuthUser & { is_admin: boolean }) | null;
}

/**
 * §13 admin analytics dashboard, Phase 1 (in-app). Real enforcement is
 * server-side — `/api/admin/analytics` 403s a non-admin, and in live mode
 * `get_admin_analytics` checks admin status itself before it will read
 * across every user's data. The `is_admin` check here just avoids flashing
 * business metrics at someone who can't actually load them.
 *
 * Fixed 90-day window, no date-range picker in v1 (§13c) — revisit if a
 * second office arrives, alongside office-scoped breakdowns.
 */
export default function AdminAnalyticsPage() {
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>(
    "/api/me",
    fetcher
  );
  const isAdmin = me?.user?.is_admin ?? false;

  const { data, error, isLoading } = useSWR<{ analytics: AdminAnalytics }>(
    isAdmin ? "/api/admin/analytics?days=90" : null,
    fetcher
  );

  if (meLoading) return <SkeletonDetail />;
  if (!me?.user) return null;

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admins only"
        description="This view is restricted to Jio admins."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-stone mt-1 text-sm">
          Last 90 days. Phase 1 — in-app, fixed charts; a self-hosted
          Metabase connected to the same database is the planned Phase 2
          for ad-hoc slicing.
        </p>
      </header>

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && <SkeletonDetail />}

      {data?.analytics && (
        <>
          <FunnelSection funnel={data.analytics.funnel} />
          <GrowthSection growth={data.analytics.growth} />
          <JioOutcomesSection outcomes={data.analytics.jioOutcomes} />
          <ContentSection content={data.analytics.content} />
          <SocialSection social={data.analytics.social} />
          <ModerationSection moderation={data.analytics.moderation} />
          <WishlistSection wishlist={data.analytics.wishlist} />
          <PerformanceSection />
        </>
      )}
    </div>
  );
}
