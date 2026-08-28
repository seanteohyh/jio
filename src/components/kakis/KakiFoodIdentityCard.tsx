"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import ShareFoodIdentityCard from "@/components/ShareFoodIdentityCard";
import { formatMonthKey } from "@/lib/utils";
import type { KakiFoodIdentitySnapshot } from "@/types";

/**
 * CHANGES_20260821_combined2.md Item 1 — replaces the "Most active" and
 * "Adventurer" stat tiles that used to sit in `KakiMetricsCharts`'s grid:
 * same two award slots, elevated into named celebratory rows on a card of
 * their own rather than left as plain numbers. Positive-only by design,
 * matching the doc — there is no negative-framed slot at this level.
 * `snapshot` is `null` until the cron has run at least once for this group.
 */
export default function KakiFoodIdentityCard({
  snapshot,
  nameFor,
}: {
  snapshot: KakiFoodIdentitySnapshot | null;
  nameFor: (userId: string) => string;
}) {
  const [sharing, setSharing] = useState(false);

  if (!snapshot) {
    return (
      <Card className="border-ember/30 bg-ember-tint/40">
        <p className="text-ink text-sm font-medium">This group's vibe</p>
        <p className="text-stone mt-1 text-xs">
          Locks in early next month, once the group's logged a few visits.
        </p>
      </Card>
    );
  }

  const awards = [
    snapshot.mostActive && {
      label: "Most active",
      value: nameFor(snapshot.mostActive.user_id),
      sub: `${snapshot.mostActive.visits} visits`,
    },
    snapshot.adventurer && {
      label: "Adventurer",
      value: nameFor(snapshot.adventurer.user_id),
      sub: `${snapshot.adventurer.distinctPlaces} different places`,
    },
  ].filter((a): a is { label: string; value: string; sub: string } => Boolean(a));

  return (
    <Card className="border-ember/30 bg-ember-tint/40 space-y-2">
      <p className="text-stone text-xs font-semibold tracking-wide uppercase">
        This group's vibe · {formatMonthKey(snapshot.month)}
      </p>
      <p className="font-display text-ink text-2xl font-bold tracking-tight">
        {snapshot.headline}
      </p>
      <p className="text-stone text-sm">{snapshot.description}</p>

      {awards.length > 0 && (
        <div className="border-line grid grid-cols-2 gap-3 border-t pt-3">
          {awards.map((award) => (
            <div key={award.label}>
              <p className="text-stone text-[11px] font-semibold tracking-wide uppercase">
                {award.label}
              </p>
              <p className="text-ink text-sm font-semibold">{award.value}</p>
              <p className="text-stone text-xs">{award.sub}</p>
            </div>
          ))}
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setSharing((prev) => !prev)}
      >
        {sharing ? "Hide share card" : "Share"}
      </Button>

      {sharing && (
        <ShareFoodIdentityCard
          eyebrow="THIS GROUP'S VIBE"
          headline={snapshot.headline}
          description={snapshot.description}
          monthLabel={formatMonthKey(snapshot.month)}
          awards={awards}
        />
      )}
    </Card>
  );
}
