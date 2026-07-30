"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, EmptyState, SectionHeading } from "../ui";
import SendLobangPanel from "./SendLobangPanel";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import { formatDate } from "@/lib/utils";
import type { LunchEvent } from "@/types";

/**
 * Closed Jios you were part of, newest first. Each one is where the "send a
 * lobang" flow starts — the whole point of keeping history here rather than
 * only in the events list is to make "hey, you'd have liked this one"
 * a one-click thing.
 */
export default function PastJios({ selfId }: { selfId: string }) {
  const { data, error, isLoading } = useSWR<{ events: LunchEvent[] }>(
    "/api/events",
    fetcher
  );
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);

  if (isLoading) return null;
  if (error) return null;

  const past = (data?.events ?? [])
    .filter((e) => e.status === "closed")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
    .slice(0, 8);

  return (
    <section>
      <SectionHeading>Past Jios</SectionHeading>

      {past.length === 0 && (
        <EmptyState
          title="No past Jios yet"
          description="Once a Jio you're part of closes, it'll show up here — and you'll be able to send the pick to a friend who wasn't there."
        />
      )}

      {past.length > 0 && (
        <ul className="space-y-2">
          {past.map((event) => (
            <li key={event.id}>
              <Card className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/events/${event.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {event.title}
                  </Link>
                  <span className="text-dolch-muted shrink-0 text-xs">
                    {formatDate(event.scheduled_at)}
                  </span>
                </div>

                <p className="text-dolch-muted text-xs">
                  {event.winner_place_name ? (
                    <>
                      Decided:{" "}
                      <span className="text-dolch-text">
                        {event.winner_place_name}
                      </span>
                    </>
                  ) : (
                    "Closed, no winner recorded"
                  )}
                  {event.host_name && ` · hosted by ${event.host_name}`}
                </p>

                {features.lobangs && (
                  <>
                    {justSent === event.id ? (
                      <p className="text-dolch-success text-xs">
                        Lobang sent.
                      </p>
                    ) : (
                      composerFor !== event.id && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setComposerFor(event.id);
                            setJustSent(null);
                          }}
                        >
                          Send lobang
                        </Button>
                      )
                    )}
                  </>
                )}
              </Card>

              {composerFor === event.id && (
                <div className="mt-2">
                  <SendLobangPanel
                    selfId={selfId}
                    eventId={event.id}
                    defaultPlaceId={event.winner_place_id}
                    defaultPlaceName={event.winner_place_name}
                    onSent={() => {
                      setComposerFor(null);
                      setJustSent(event.id);
                    }}
                    onCancel={() => setComposerFor(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
