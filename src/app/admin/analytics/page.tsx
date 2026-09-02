"use client";

import { useState } from "react";
import useSWR from "swr";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import {
  FunnelSection,
  FunnelStepsSection,
  GrowthSection,
  JioOutcomesSection,
  RecentEntrantsSection,
} from "@/components/admin/AdminAnalyticsCharts";
import { useAnalyticsDays } from "@/components/admin/AdminDateRangePicker";
import { fetcher } from "@/lib/fetcher";
import type { AdminAnalytics, AdminUserSegmentKey } from "@/types";

const SEGMENT_LABELS: Record<AdminUserSegmentKey, string> = {
  powerHosts: "Power hosts",
  activeVoters: "Active voters",
  rsvpOnlyLurkers: "RSVP-only lurkers",
  reviewers: "Reviewers",
  dormant: "Dormant",
  newAndActive: "New & active",
};

/** Overview — the sections every other view builds on: today's activity
 *  snapshot, the real decided-Jio step funnel, growth over the window, and
 *  how Jios have been resolving.
 *
 *  Part 1 §E — the segment filter re-slices Jio Outcomes and the real
 *  funnel to just Jios hosted by the chosen segment's members. Growth and
 *  the same-day funnel snapshot stay unfiltered on purpose: a segment like
 *  "power host" is earned by activity a brand-new signup hasn't had time
 *  to accumulate, so filtering "new users" by it wouldn't have a coherent
 *  reading. */
export default function AdminAnalyticsOverviewPage() {
  const days = useAnalyticsDays();
  const [segment, setSegment] = useState<AdminUserSegmentKey | "">("");
  const { data, error, isLoading } = useSWR<{ analytics: AdminAnalytics }>(
    `/api/admin/analytics?days=${days}${segment ? `&segment=${segment}` : ""}`,
    fetcher
  );

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (isLoading) return <SkeletonDetail />;
  if (!data?.analytics) return null;

  return (
    <>
      <FunnelSection funnel={data.analytics.funnel} />
      <RecentEntrantsSection recentEntrants={data.analytics.recentEntrants ?? []} />

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="segment-filter" className="text-stone">
          Slice Jio Outcomes + the real funnel by segment:
        </label>
        <select
          id="segment-filter"
          value={segment}
          onChange={(e) => setSegment(e.target.value as AdminUserSegmentKey | "")}
          className="border-line bg-paper text-ink rounded-lg border px-2 py-1"
        >
          <option value="">All</option>
          {(Object.keys(SEGMENT_LABELS) as AdminUserSegmentKey[]).map((key) => (
            <option key={key} value={key}>
              {SEGMENT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <FunnelStepsSection
        funnelSteps={data.analytics.funnelSteps}
        windowDays={data.analytics.windowDays}
        appliedSegmentLabel={
          data.analytics.appliedSegment ? SEGMENT_LABELS[data.analytics.appliedSegment] : null
        }
      />
      <GrowthSection
        growth={data.analytics.growth}
        windowDays={data.analytics.windowDays}
      />
      <JioOutcomesSection
        outcomes={data.analytics.jioOutcomes}
        appliedSegmentLabel={
          data.analytics.appliedSegment ? SEGMENT_LABELS[data.analytics.appliedSegment] : null
        }
      />
    </>
  );
}
