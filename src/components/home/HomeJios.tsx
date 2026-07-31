"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, EmptyState, SectionHeading } from "../ui";
import { fetcher } from "@/lib/fetcher";
import { formatTime, relativeDayLabel } from "@/lib/utils";
import type { LunchEvent } from "@/types";

/** Upcoming and recently-closed Jios, on the home page. */
export default function HomeJios() {
  const { data, error, isLoading } = useSWR<{ events: LunchEvent[] }>(
    "/api/events",
    fetcher
  );

  if (isLoading) {
    return (
      <Card>
        <p className="text-stone text-sm">Loading your Jios…</p>
      </Card>
    );
  }

  if (error) return null;

  const now = Date.now();
  const events = data?.events ?? [];

  // Anything still ahead, plus anything closed in the last day so the outcome
  // is still visible to people who missed the notification.
  const relevant = events
    .filter((e) => {
      // A polling Flexi Jio has no real date yet — see it as a card here
      // once it's confirmed. NeedsAvailability is its home until then.
      if (e.date_phase === "polling") return false;
      const when = new Date(e.scheduled_at).getTime();
      if (e.status === "cancelled") return false;
      return when > now - 24 * 3600 * 1000;
    })
    .slice(0, 4);

  if (relevant.length === 0) {
    return (
      <EmptyState
        title="No Jios on the calendar"
        description="Start one above and people can vote on where to go."
      />
    );
  }

  return (
    <section>
      <SectionHeading
        action={
          <Link href="/events" className="text-ember text-xs underline">
            See all
          </Link>
        }
      >
        Coming up
      </SectionHeading>

      <ul className="space-y-2">
        {relevant.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="border-line bg-cream/60 hover:border-ember/40 block rounded-xl border p-3 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{event.title}</span>
                <span className="text-stone shrink-0 text-xs">
                  {relativeDayLabel(event.scheduled_at)} ·{" "}
                  {formatTime(event.scheduled_at)}
                </span>
              </div>

              <p className="text-stone mt-1 text-xs">
                {event.status === "closed" ? (
                  event.winner_place_name ? (
                    <span className="text-sage">
                      Decided: {event.winner_place_name}
                    </span>
                  ) : (
                    "Closed, no winner"
                  )
                ) : (
                  <>
                    {event.option_count ?? 0} option
                    {event.option_count === 1 ? "" : "s"}
                    {typeof event.going_count === "number" &&
                      event.going_count > 0 &&
                      ` · ${event.going_count} going`}
                    {event.host_name && ` · hosted by ${event.host_name}`}
                  </>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
