"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ShareNodesIcon } from "@/components/icons";
import ShareFoodIdentityCard from "@/components/ShareFoodIdentityCard";
import { formatMonthKey } from "@/lib/utils";
import type { UserFoodIdentitySnapshot } from "@/types";

/**
 * CHANGES_20260821_combined2.md Item 1 — headlines Profile's "Your numbers,"
 * above the plain stat tiles. `snapshot` is the latest locked monthly card;
 * `null` until the cron has run at least once for this account.
 */
export default function FoodIdentityCard({
  snapshot,
}: {
  snapshot: UserFoodIdentitySnapshot | null;
}) {
  const [sharing, setSharing] = useState(false);

  if (!snapshot) {
    return (
      <Card className="border-ember/30 bg-ember-tint/40">
        <p className="text-ink text-sm font-medium">Your food identity</p>
        <p className="text-stone mt-1 text-xs">
          Locks in early next month, once you've logged a few visits.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-ember/30 bg-ember-tint/40 space-y-2">
      <p className="text-stone text-xs font-semibold tracking-wide uppercase">
        Your food identity · {formatMonthKey(snapshot.month)}
      </p>
      <p className="font-display text-ink text-2xl font-bold tracking-tight">
        {snapshot.headline}
      </p>
      <p className="text-stone text-sm">{snapshot.description}</p>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setSharing((prev) => !prev)}
      >
        {!sharing && (
          <ShareNodesIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        {sharing ? "Hide share card" : "Share"}
      </Button>

      {sharing && (
        <ShareFoodIdentityCard
          eyebrow="YOUR FOOD IDENTITY"
          headline={snapshot.headline}
          description={snapshot.description}
          monthLabel={formatMonthKey(snapshot.month)}
        />
      )}
    </Card>
  );
}
