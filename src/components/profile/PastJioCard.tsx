"use client";

import Link from "next/link";
import { Button, Card } from "../ui";
import SendLobangPanel from "./SendLobangPanel";
import { features } from "@/lib/config";
import { formatDate } from "@/lib/utils";
import type { LunchEvent } from "@/types";

/**
 * One closed/cancelled Jio's row — the "send a lobang" composer lives here
 * so both the profile page's short preview (`PastJios`) and the full
 * `/profile/jios` list render the exact same card and flow, not two copies
 * that could drift. Composer/sent state is lifted to whichever list is
 * rendering the card, since only one composer should be open at a time
 * across the whole list.
 */
export default function PastJioCard({
  event,
  selfId,
  composerOpen,
  justSent,
  onOpenComposer,
  onSent,
  onCancelComposer,
}: {
  event: LunchEvent;
  selfId: string;
  composerOpen: boolean;
  justSent: boolean;
  onOpenComposer: () => void;
  onSent: () => void;
  onCancelComposer: () => void;
}) {
  return (
    <li>
      <Card className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={`/events/${event.id}`}
            className="truncate font-medium hover:underline"
          >
            {event.title}
          </Link>
          <span className="text-stone shrink-0 text-xs">
            {formatDate(event.scheduled_at)}
          </span>
        </div>

        <p className="text-stone text-xs">
          {event.status === "cancelled" ? (
            "Cancelled"
          ) : event.winner_place_name ? (
            <>
              Decided: <span className="text-ink">{event.winner_place_name}</span>
            </>
          ) : (
            "Closed, no winner recorded"
          )}
          {event.host_name && ` · hosted by ${event.host_name}`}
        </p>

        {features.lobangs && event.status === "closed" && (
          <>
            {justSent ? (
              <p className="text-sage text-xs">Lobang sent.</p>
            ) : (
              !composerOpen && (
                <Button variant="secondary" size="sm" onClick={onOpenComposer}>
                  Send lobang
                </Button>
              )
            )}
          </>
        )}
      </Card>

      {composerOpen && (
        <div className="mt-2">
          <SendLobangPanel
            selfId={selfId}
            eventId={event.id}
            defaultPlaceId={event.winner_place_id}
            defaultPlaceName={event.winner_place_name}
            onSent={onSent}
            onCancel={onCancelComposer}
          />
        </div>
      )}
    </li>
  );
}
