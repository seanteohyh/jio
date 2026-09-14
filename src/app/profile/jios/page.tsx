"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, Chip, EmptyState, SkeletonDetail } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import PastJioCard from "@/components/profile/PastJioCard";
import { fetcher } from "@/lib/fetcher";
import type { AuthUser, LunchEvent } from "@/types";

type StatusFilter = "all" | "closed" | "cancelled";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "closed", label: "Closed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function ProfileJiosPage() {
  const { data: me } = useSWR<{ user: AuthUser | null }>("/api/me", fetcher);
  const { data, error, isLoading, mutate } = useSWR<{ events: LunchEvent[] }>(
    "/api/events",
    fetcher
  );
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);

  const selfId = me?.user?.id;

  const past = (data?.events ?? [])
    .filter((e) => e.status === "closed" || e.status === "cancelled")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const filtered = past.filter((e) => filter === "all" || e.status === filter);

  return (
    <div className="animate-fade-in space-y-4">
      <Link href="/profile" className="text-ember text-sm underline">
        ← Back to You
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Past Jios &middot; {past.length}
        </h1>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={filter === f.key}
            pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {isLoading || !selfId ? (
        <SkeletonDetail />
      ) : error ? (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-stone flex items-center gap-2 text-sm">
            <AlertIcon className="text-ember h-4 w-4 shrink-0" aria-hidden="true" />
            Couldn&apos;t load your past Jios.
          </p>
          <Button variant="secondary" size="sm" onClick={() => mutate()}>
            Try again
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description={
            filter === "all"
              ? "Once a Jio you're part of closes, it'll show up here."
              : `No ${filter} Jios yet.`
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((event) => (
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
    </div>
  );
}
