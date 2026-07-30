"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  EmptyState,
  ErrorNote,
  LinkButton,
  SectionHeading,
  Spinner,
} from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import { formatTime, relativeDayLabel } from "@/lib/utils";
import type { LunchEvent } from "@/types";

function EventRow({ event }: { event: LunchEvent }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="border-dolch-border bg-dolch-surface/60 hover:border-dolch-accent/40 block rounded-xl border p-3 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{event.title}</span>
        <span className="text-dolch-muted shrink-0 text-xs">
          {relativeDayLabel(event.scheduled_at)} ·{" "}
          {formatTime(event.scheduled_at)}
        </span>
      </div>
      <p className="text-dolch-muted mt-1 text-xs">
        {event.status === "closed" ? (
          event.winner_place_name ? (
            <span className="text-dolch-success">
              Went to {event.winner_place_name}
            </span>
          ) : (
            "Closed without a winner"
          )
        ) : (
          <>
            {event.option_count ?? 0} option
            {event.option_count === 1 ? "" : "s"}
            {typeof event.going_count === "number" &&
              ` · ${event.going_count} going`}
            {event.host_name && ` · ${event.host_name}`}
          </>
        )}
      </p>
    </Link>
  );
}

export default function EventsPage() {
  const { data, error, isLoading } = useSWR<{ events: LunchEvent[] }>(
    "/api/events",
    fetcher
  );

  const events = data?.events ?? [];
  const now = Date.now();

  const upcoming = events.filter(
    (e) => e.status === "open" && new Date(e.scheduled_at).getTime() > now - 3600000
  );
  const past = events
    .filter((e) => !upcoming.includes(e))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jios</h1>
          <p className="text-dolch-muted mt-1 text-sm">
            Lunches you are hosting, invited to, or in the group for.
          </p>
        </div>
        <LinkButton href="/events/new">New</LinkButton>
      </header>

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && <Spinner />}

      {!isLoading && events.length === 0 && (
        <EmptyState
          title="No Jios yet"
          description="Start one and everyone invited can add places and rank them."
          action={<LinkButton href="/events/new">Start a Jio</LinkButton>}
        />
      )}

      {upcoming.length > 0 && (
        <section>
          <SectionHeading>Open</SectionHeading>
          <ul className="space-y-2">
            {upcoming.map((event) => (
              <li key={event.id}>
                <EventRow event={event} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionHeading>Done</SectionHeading>
          <ul className="space-y-2">
            {past.slice(0, 20).map((event) => (
              <li key={event.id}>
                <EventRow event={event} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
