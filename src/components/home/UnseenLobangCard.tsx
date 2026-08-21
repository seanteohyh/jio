"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card } from "../ui";
import { fetcher } from "@/lib/fetcher";
import type { Lobang } from "@/types";

/**
 * CHANGES_20260819e.md §1 — a lobang is otherwise buried in "You," well past
 * anything visible without deliberate scrolling, and never actively nudges
 * anyone toward it. This surfaces the moment there's something unseen,
 * near the bottom of Home — same placement spirit as `NeedsAvailability` /
 * `AddToHomeScreenCard`: worth surfacing, not worth interrupting.
 *
 * Self-resolving, same as those two: visiting `/lobangs` marks it seen
 * (identical mechanism to Profile's own `LobangInbox`), so this simply stops
 * rendering on the next load rather than needing its own dismiss control.
 */
export default function UnseenLobangCard() {
  const { data } = useSWR<{ lobangs: Lobang[] }>(
    "/api/lobangs?direction=received&limit=5",
    fetcher
  );

  const unseen = (data?.lobangs ?? []).filter((l) => !l.seen_at);
  if (unseen.length === 0) return null;

  const [latest] = unseen;

  return (
    <Link href="/lobangs" className="block">
      <Card className="border-ember/30 bg-ember-tint flex items-start gap-2.5">
        <span className="text-xl" aria-hidden="true">
          📌
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {unseen.length === 1
              ? `${latest.from_display_name ?? "A teammate"} sent you a lobang`
              : `${unseen.length} new lobangs waiting for you`}
          </p>
          <p className="text-stone mt-0.5 text-xs">
            {unseen.length === 1
              ? (latest.place?.name ?? "Take a look")
              : "Tips from teammates, worth a look."}
          </p>
        </div>
      </Card>
    </Link>
  );
}
