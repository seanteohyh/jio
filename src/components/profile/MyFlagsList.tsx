"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, SectionHeading } from "../ui";
import { fetcher } from "@/lib/fetcher";
import { relativeDayLabel } from "@/lib/utils";
import type { FlagReason, PlaceFlag } from "@/types";

const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  closed: "Permanently closed",
  wrong_info: "Wrong information",
  duplicate: "Duplicate of another place",
  inappropriate: "Inappropriate",
  other: "Other",
};

const RESOLUTION_LABELS: Record<string, string> = {
  dismissed: "Reviewed — no change",
  edited: "Reviewed — fixed",
  blocked: "Reviewed — removed",
};

/**
 * "My Reports" — places this user has flagged, and what an admin decided.
 * Pull-based, not a notification: a report doesn't page anyone, it just sits
 * here until an admin gets to the queue.
 */
export default function MyFlagsList() {
  const { data } = useSWR<{ flags: PlaceFlag[] }>("/api/flags/mine", fetcher);
  const flags = data?.flags ?? [];

  if (flags.length === 0) return null;

  return (
    <section>
      <SectionHeading>My reports</SectionHeading>
      <ul className="space-y-2">
        {flags.map((flag) => (
          <li key={flag.id}>
            <Card className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <Link
                  href={`/places/${flag.place_id}`}
                  className="text-ember font-medium hover:underline"
                >
                  {flag.place_name ?? "A place"}
                </Link>
                <p className="text-stone text-xs">
                  {FLAG_REASON_LABELS[flag.reason]}
                  {flag.created_at && ` · ${relativeDayLabel(flag.created_at)}`}
                </p>
              </div>
              <span className="text-stone shrink-0 text-xs">
                {flag.status === "pending"
                  ? "Pending review"
                  : (RESOLUTION_LABELS[flag.resolution ?? ""] ?? "Reviewed")}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
