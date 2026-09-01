import Link from "next/link";
import { formatTime, relativeDayLabel } from "@/lib/utils";
import type { LunchEvent } from "@/types";

/** One Jio, as a compact card — shared by the Jios list view and Home's
 *  capped upcoming list, so the two don't drift into two different looks
 *  for the same kind of row. */
export default function EventRow({ event }: { event: LunchEvent }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="border-line bg-cream/60 hover:border-ember/40 block rounded-xl border p-3 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base truncate font-medium">{event.title}</span>
        <span className="text-stone shrink-0 text-xs">
          {relativeDayLabel(event.scheduled_at)} ·{" "}
          {formatTime(event.scheduled_at)}
        </span>
      </div>
      <p className="text-stone mt-1 text-xs">
        {event.status === "cancelled" ? (
          `Cancelled${event.host_name ? ` by ${event.host_name}` : ""}`
        ) : event.status === "closed" ? (
          event.winner_place_name || event.winner_label ? (
            <span className="text-sage">
              {/* Closed just means voting's locked, not that the lunch has
                  actually happened — a Jio can be decided well ahead of its
                  own date. Past tense only once scheduled_at itself has. */}
              {new Date(event.scheduled_at).getTime() > Date.now()
                ? "Going to"
                : "Went to"}{" "}
              {event.winner_place_name ?? event.winner_label}
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
