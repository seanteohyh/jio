"use client";

import Link from "next/link";
import useSWR from "swr";
import { Button, Card, EmptyState, ErrorNote, SkeletonRows } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import { formatCents } from "@/lib/expenses";
import { formatDate } from "@/lib/utils";
import type { SplitSummary } from "@/types";

interface MeResponse {
  user: { id: string } | null;
}

/** "Your splits" — ones you've started, plus ones you're just a
 *  participant in. Doesn't require ever having created a Jio; a split
 *  stands on its own, and a Jio-linked one shows which Jio it's for. */
export default function SplitsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ splits: SplitSummary[] }>(
    "/api/splits",
    fetcher
  );
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);

  const splits = data?.splits ?? [];

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Splits</h1>
          <p className="text-stone mt-1 text-sm">
            Photograph a receipt, pick what everyone had, and see who owes
            who — no Jio required.
          </p>
        </div>
        <Link href="/splits/new">
          <Button>New</Button>
        </Link>
      </header>

      {error && (
        <Card className="flex items-center justify-between gap-3">
          <ErrorNote>Couldn&apos;t load your splits.</ErrorNote>
          <Button variant="secondary" size="sm" onClick={() => mutate()}>
            Try again
          </Button>
        </Card>
      )}
      {isLoading && <SkeletonRows />}

      {!isLoading && !error && splits.length === 0 && (
        <EmptyState
          title="No splits yet"
          description="Take a photo of a receipt or type in the items by hand — splitting it doesn't need a Jio first."
          action={
            <Link href="/splits/new">
              <Button>Split a bill</Button>
            </Link>
          }
        />
      )}

      {splits.length > 0 && (
        <ul className="space-y-2">
          {splits.map((split) => (
            <li key={split.id}>
              <Link href={`/splits/${split.id}`}>
                <Card className="hover:border-ember/40 flex items-center justify-between gap-3 transition-colors">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{split.title}</p>
                    <p className="text-stone text-xs">
                      {formatDate(split.created_at)}
                      {split.event_title && <> · {split.event_title}</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {split.role === "creator" ? (
                      <span className="text-stone">You started this</span>
                    ) : (
                      <span className="text-ember font-medium">
                        {typeof split.your_owed_cents === "number" && split.your_owed_cents > 0
                          ? `You owe ${formatCents(split.your_owed_cents)}`
                          : "You're in this"}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {me?.user === null && (
        <p className="text-stone text-xs">Sign in to see your splits.</p>
      )}
    </div>
  );
}
