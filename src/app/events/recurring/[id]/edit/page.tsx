"use client";

import { use } from "react";
import useSWR from "swr";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import RecurringSeriesForm from "@/components/events/RecurringSeriesForm";
import { fetcher } from "@/lib/fetcher";
import type { RecurringSeries } from "@/types";

/**
 * Edit a standing weekly Jio — CHANGES_20260819b.md §3. No dedicated
 * single-series fetch exists (or is worth adding just for this): a host's
 * own series list is small and already host-scoped, so this reuses the
 * same `/api/recurring-series` the Jios page's own Recurring card already
 * fetches, and finds this one by id client-side.
 */
export default function EditRecurringSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<{ series: RecurringSeries[] }>(
    "/api/recurring-series",
    fetcher
  );

  if (isLoading) return <SkeletonDetail />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;

  const series = data?.series.find((s) => s.id === id);
  if (!series) {
    return <ErrorNote>That recurring Jio doesn&apos;t exist.</ErrorNote>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit standing Jio
        </h1>
        <p className="text-stone mt-1 text-sm">
          Changes apply from the next occurrence on — and to one already
          generated, if it's still open and nobody's answered yet.
        </p>
      </header>

      <RecurringSeriesForm initialSeries={series} />
    </div>
  );
}
