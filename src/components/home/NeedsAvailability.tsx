"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, SectionHeading } from "../ui";
import { fetcher } from "@/lib/fetcher";
import type { LunchEvent } from "@/types";

/**
 * Every Flexi Jio still in its "picking a date" phase that the viewer is
 * invited to — all of them, not just the ones they haven't marked yet.
 * Already-answered entries stay visible, just greyed and checked, so this
 * doubles as a reminder of what's still moving.
 */
export default function NeedsAvailability() {
  const { data } = useSWR<{ events: LunchEvent[] }>("/api/events", fetcher);

  const polling = (data?.events ?? []).filter(
    (e) => e.date_phase === "polling"
  );

  if (polling.length === 0) return null;

  return (
    <section>
      <SectionHeading>Needs your availability</SectionHeading>
      <ul className="space-y-2">
        {polling.map((event) => {
          const answered = event.has_marked_availability;
          return (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className={
                  "block rounded-xl border p-3 transition-colors " +
                  (answered
                    ? "border-line bg-paper opacity-70"
                    : "border-line bg-cream/60 hover:border-ember/40")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{event.title}</span>
                  <span
                    className={
                      "shrink-0 text-xs " +
                      (answered ? "text-sage" : "text-ember")
                    }
                  >
                    {answered ? "Answered ✓" : "Mark your availability"}
                  </span>
                </div>
                {event.host_name && (
                  <p className="text-stone mt-1 text-xs">
                    hosted by {event.host_name}
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
