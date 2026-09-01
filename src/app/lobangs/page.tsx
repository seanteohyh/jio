"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, EmptyState, ErrorNote, Skeleton } from "@/components/ui";
import HintCard from "@/components/HintCard";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { mergeLobangFeed, relativeDayLabel } from "@/lib/utils";
import type { Lobang } from "@/types";

/**
 * CHANGES_20260816.md §2 — a dedicated place to browse your lobangs, styled
 * like message bubbles: one reverse-chronological feed merging received and
 * sent, your own sends right-aligned. Deliberately "browse," not "chat" —
 * a lobang has no reply, and a group send has no one other person to file a
 * thread under, so this reads as a shared stream rather than a per-contact
 * conversation. No new schema or endpoint: both directions already come
 * from `/api/lobangs`, merged and sorted client-side.
 */

interface LobangsResponse {
  lobangs: Lobang[];
}

// A generous browsing window, not a hard "everything ever" — same
// `?limit=` param `LobangInbox` already uses for its capped preview, just a
// bigger number here since browsing is the point of this page.
const FEED_LIMIT = 100;

export default function LobangsPage() {
  const {
    data: received,
    error: receivedError,
    isLoading: receivedLoading,
  } = useSWR<LobangsResponse>(
    `/api/lobangs?direction=received&limit=${FEED_LIMIT}`,
    fetcher
  );
  const {
    data: sent,
    error: sentError,
    isLoading: sentLoading,
  } = useSWR<LobangsResponse>(
    `/api/lobangs?direction=sent&limit=${FEED_LIMIT}`,
    fetcher
  );

  // Same "viewing is seeing" behaviour as LobangInbox — browsing this page
  // clears the "New" badge exactly like opening your profile does.
  const marked = useRef(new Set<string>());
  useEffect(() => {
    const unseen = (received?.lobangs ?? []).filter(
      (l) => !l.seen_at && !marked.current.has(l.id)
    );
    for (const l of unseen) {
      marked.current.add(l.id);
      mutateJson(`/api/lobangs/${l.id}`, "PUT").catch(() => {
        marked.current.delete(l.id);
      });
    }
  }, [received]);

  const isLoading = receivedLoading || sentLoading;
  const error = receivedError ?? sentError;

  const feed = mergeLobangFeed(received?.lobangs ?? [], sent?.lobangs ?? []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Lobangs</h1>
        <p className="text-stone mt-1 text-sm">
          Everything sent your way, and everything you&apos;ve sent — newest
          first.
        </p>
      </header>

      <HintCard page="lobangs" icon="📌">
        Lobang means a tip — &ldquo;saw this, thought of you.&rdquo; Send one
        from any place&apos;s page.
      </HintCard>

      {/* UX review log #14 — six identical left-aligned bars against a
          real feed that's a chat layout (sent messages right-aligned)
          read as the wrong shape entirely, not just the wrong size.
          Alternating alignment here, not a straight SkeletonRows stack. */}
      {isLoading && (
        <ul className="space-y-2" role="status" aria-label="Loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className={i % 3 === 1 ? "flex justify-end" : "flex justify-start"}
            >
              <Skeleton className="h-14 w-2/3" />
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorNote>{error.message}</ErrorNote>}

      {!isLoading && !error && feed.length === 0 && (
        <EmptyState
          title="No lobangs yet"
          description="Send one from a place's page, or from a past Jio on your profile — they'll show up here."
        />
      )}

      {feed.length > 0 && (
        <ul className="space-y-3">
          {feed.map((l) =>
            l.direction === "sent" ? (
              <li key={`sent-${l.id}`} className="flex justify-end">
                <div className="bg-ember max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm text-white">
                  <p>
                    <span className="text-white/75">To </span>
                    <span className="font-medium">
                      {l.to_display_name ?? "a teammate"}
                    </span>
                  </p>
                  <p className="mt-0.5">
                    {l.place ? (
                      <Link
                        href={`/places/${l.place_id}`}
                        className="font-medium underline"
                      >
                        {l.place.name}
                      </Link>
                    ) : (
                      "a place"
                    )}
                  </p>
                  {l.note && (
                    <p className="mt-1 whitespace-pre-wrap text-white/90 italic">
                      “{l.note}”
                    </p>
                  )}
                  <p className="text-white/70 mt-1.5 text-xs">
                    {l.event_title && `From ${l.event_title} · `}
                    {l.created_at && relativeDayLabel(l.created_at)}
                  </p>
                </div>
              </li>
            ) : (
              <li key={`received-${l.id}`} className="flex justify-start">
                <div className="flex max-w-[85%] items-end gap-2">
                  <Avatar
                    name={l.from_display_name ?? "Teammate"}
                    id={l.from_user_id}
                  />
                  <div className="border-line bg-cream rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm">
                    <p>
                      <span className="font-medium">
                        {l.from_display_name ?? "A teammate"}
                      </span>
                      <span className="text-stone"> recommends</span>
                      {!l.seen_at && (
                        <span className="bg-ember ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          New
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5">
                      {l.place ? (
                        <Link
                          href={`/places/${l.place_id}`}
                          className="text-ember font-medium hover:underline"
                        >
                          {l.place.name}
                        </Link>
                      ) : (
                        <span className="font-medium">a place</span>
                      )}
                    </p>
                    {l.note && (
                      <p className="text-stone mt-1 whitespace-pre-wrap italic">
                        “{l.note}”
                      </p>
                    )}
                    <p className="text-stone mt-1.5 text-xs">
                      {l.event_title && `From ${l.event_title} · `}
                      {l.created_at && relativeDayLabel(l.created_at)}
                    </p>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
