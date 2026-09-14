"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, EmptyState, SectionHeading } from "../ui";
import { AlertIcon } from "@/components/icons";
import PastJioCard from "./PastJioCard";
import { fetcher } from "@/lib/fetcher";
import type { LunchEvent } from "@/types";

const PREVIEW_COUNT = 3;

/**
 * Closed Jios you were part of, newest first. Each one is where the "send a
 * lobang" flow starts — the whole point of keeping history here rather than
 * only in the events list is to make "hey, you'd have liked this one"
 * a one-click thing.
 */
export default function PastJios({ selfId }: { selfId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ events: LunchEvent[] }>(
    "/api/events",
    fetcher
  );
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);

  if (isLoading) return null;

  // UX review log #7 — this used to fail silently (`return null`), so your
  // own history just vanished with no explanation. Core enough to warrant a
  // visible retry rather than the silent-failure treatment.
  if (error) {
    return (
      <section>
        <SectionHeading>Past Jios</SectionHeading>
        <Card className="flex items-center justify-between gap-3">
          <p className="text-stone flex items-center gap-2 text-sm">
            <AlertIcon className="text-ember h-4 w-4 shrink-0" aria-hidden="true" />
            Couldn&apos;t load your past Jios.
          </p>
          <Button variant="secondary" size="sm" onClick={() => mutate()}>
            Try again
          </Button>
        </Card>
      </section>
    );
  }

  const all = (data?.events ?? [])
    .filter((e) => e.status === "closed")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const past = all.slice(0, PREVIEW_COUNT);

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
            <PastJioCard
              key={event.id}
              event={event}
              selfId={selfId}
              composerOpen={composerFor === event.id}
              justSent={justSent === event.id}
              onOpenComposer={() => {
                setComposerFor(event.id);
                setJustSent(null);
              }}
              onSent={() => {
                setComposerFor(null);
                setJustSent(event.id);
              }}
              onCancelComposer={() => setComposerFor(null)}
            />
          ))}
        </ul>
      )}

      {all.length > PREVIEW_COUNT && (
        <Link
          href="/profile/jios"
          className="text-ember mt-2 block text-xs font-semibold"
        >
          See all {all.length} →
        </Link>
      )}
    </section>
  );
}
