"use client";

import useSWR from "swr";
import { EmptyState, SkeletonDetail } from "@/components/ui";
import AdminAnalyticsTabs from "@/components/admin/AdminAnalyticsTabs";
import { fetcher } from "@/lib/fetcher";
import type { AuthUser } from "@/types";

interface MeResponse {
  user: (AuthUser & { is_admin: boolean }) | null;
}

/**
 * CHANGES_20260821_combined.md Part 1 §A — the admin gate and tab nav,
 * lifted up from the single page.tsx this used to be into a layout shared
 * by all seven analytics views. Real enforcement stays server-side per
 * route (`/api/admin/analytics*` 403s a non-admin, and in live mode the
 * underlying `SECURITY DEFINER` functions check admin status themselves
 * before reading across every user's data) — this client-side check just
 * avoids flashing business metrics at someone who can't actually load them,
 * same reasoning the original single-page version already had.
 */
export default function AdminAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>(
    "/api/me",
    fetcher
  );
  const isAdmin = me?.user?.is_admin ?? false;

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

      <AdminAnalyticsTabs />

      {children}
    </div>
  );
}
