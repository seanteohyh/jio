"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, Card, SectionHeading } from "../ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { relativeDayLabel } from "@/lib/utils";
import type { Lobang } from "@/types";

/**
 * Lobangs sent to you, plus a short history of ones you've sent. Always
 * targeted — either to specific teammates or to a whole Kaki at once — never
 * a broadcast to the entire team.
 */
export default function LobangInbox() {
  const { data: received, mutate: mutateReceived } = useSWR<{
    lobangs: Lobang[];
  }>("/api/lobangs?direction=received", fetcher);
  const { data: sent } = useSWR<{ lobangs: Lobang[] }>(
    "/api/lobangs?direction=sent&limit=5",
    fetcher
  );

  const marked = useRef(new Set<string>());

  // Viewing your profile is what "seeing" a lobang means here — no separate
  // "mark as read" click. The unseen ones still render with the "New" tag
  // for this render, since we never re-fetch after marking them.
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

  const dismiss = async (id: string) => {
    await mutateJson(`/api/lobangs/${id}`, "DELETE").catch(() => {});
    mutateReceived();
  };

  const inbox = received?.lobangs ?? [];
  const history = sent?.lobangs ?? [];

  if (inbox.length === 0 && history.length === 0) return null;

  return (
    <section className="space-y-4">
      {inbox.length > 0 && (
        <div>
          <SectionHeading>Lobangs for you</SectionHeading>
          <ul className="space-y-2">
            {inbox.map((l) => (
              <li key={l.id}>
                <Card className="flex items-start gap-2.5">
                  <Avatar
                    name={l.from_display_name ?? "Teammate"}
                    id={l.from_user_id}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {l.from_display_name ?? "A teammate"}
                      </span>
                      <span className="text-dolch-muted"> recommends </span>
                      {l.place ? (
                        <Link
                          href={`/places/${l.place_id}`}
                          className="text-dolch-accent font-medium hover:underline"
                        >
                          {l.place.name}
                        </Link>
                      ) : (
                        <span className="font-medium">a place</span>
                      )}
                      <span className="text-dolch-muted"> for you</span>
                      {!l.seen_at && (
                        <span className="bg-dolch-accent ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          New
                        </span>
                      )}
                    </p>

                    {l.note && (
                      <p className="text-dolch-muted mt-1 text-sm italic">
                        “{l.note}”
                      </p>
                    )}

                    <p className="text-dolch-muted mt-1 text-xs">
                      {l.event_title && `From ${l.event_title} · `}
                      {l.created_at && relativeDayLabel(l.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(l.id)}
                    className="text-dolch-muted hover:text-dolch-text shrink-0 text-xs underline"
                  >
                    Dismiss
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <SectionHeading>Lobangs you sent</SectionHeading>
          <ul className="space-y-1.5">
            {history.map((l) => (
              <li
                key={l.id}
                className="text-dolch-muted flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">
                  To {l.to_display_name ?? "a teammate"}:{" "}
                  <span className="text-dolch-text">
                    {l.place?.name ?? "a place"}
                  </span>
                </span>
                <span className="shrink-0">
                  {l.created_at && relativeDayLabel(l.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
