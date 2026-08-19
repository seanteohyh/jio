"use client";

import RecurringSeriesForm from "@/components/events/RecurringSeriesForm";

/**
 * Create a standing weekly Jio — CHANGES_20260801.md §10, "Recurring Jios —
 * extended." A series is a generator, not a Jio itself: it produces an
 * ordinary open Jio each week via the exact same `createEvent` a one-off
 * Jio uses, so everything downstream (voting, RSVP, closing, cancelling)
 * already just works on whatever comes out of it.
 */
export default function NewRecurringSeriesPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Make it a standing Jio
        </h1>
        <p className="text-stone mt-1 text-sm">
          Generates a new Jio every week — up to a few days ahead, so there&apos;s
          time to vote or just show up.
        </p>
      </header>

      <RecurringSeriesForm />
    </div>
  );
}
