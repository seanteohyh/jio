"use client";

import Link from "next/link";
import { Button, Card, SectionHeading } from "@/components/ui";
import { formatCents } from "@/lib/expenses";
import type { EventDetail } from "@/types";

/**
 * A thin pointer from the Jio page into the real, standalone split UI
 * (`/splits/[id]`) — splitting a bill doesn't require a Jio at all (see
 * `src/app/splits/`), so the full review/breakdown UI only ever lives
 * there, not duplicated here. This card just says whether one exists for
 * this Jio yet, and links to it either way.
 */
export default function SplitSummaryCard({ event }: { event: EventDetail }) {
  const split = event.billSplit;

  return (
    <Card className="space-y-3">
      <SectionHeading>Split the bill</SectionHeading>

      {split ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{split.title}</p>
            <p className="text-stone text-xs">
              {split.participants.length} people ·{" "}
              {formatCents(
                split.items.reduce((sum, i) => sum + i.amount_cents, 0) +
                  (split.gst_included ? split.gst_cents : 0) +
                  (split.service_charge_included ? split.service_charge_cents : 0)
              )}{" "}
              total
            </p>
          </div>
          <Link href={`/splits/${split.id}`} className="shrink-0">
            <Button size="sm" variant="secondary">
              View the split
            </Button>
          </Link>
        </div>
      ) : (
        <Link href={`/splits/new?eventId=${event.id}`}>
          <Button size="sm">Start a split for this Jio</Button>
        </Link>
      )}
    </Card>
  );
}
