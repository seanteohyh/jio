"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertIcon } from "@/components/icons";
import { Avatar, Button, Card, SectionHeading } from "../ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { cn, relativeDayLabel } from "@/lib/utils";
import type { Lobang } from "@/types";

/**
 * One received lobang, with its reactions — CHANGES §3: heart it, reply with
 * a freeform note, or jump straight into starting a Jio at that place.
 * Kept as its own component so the reply textarea's open/closed state is
 * per-card rather than a keyed map living in the parent.
 */
function ReceivedLobangCard({
  lobang,
  onChanged,
  onDismiss,
}: {
  lobang: Lobang;
  onChanged: () => void;
  onDismiss: (id: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState(lobang.reply ?? "");
  const [busy, setBusy] = useState(false);

  const toggleLike = async () => {
    setBusy(true);
    try {
      await mutateJson(`/api/lobangs/${lobang.id}/like`, "POST");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await mutateJson(`/api/lobangs/${lobang.id}/reply`, "POST", {
        text: replyText.trim(),
      });
      setReplying(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <Card className="flex items-start gap-2.5">
        <Avatar name={lobang.from_display_name ?? "Teammate"} id={lobang.from_user_id} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-medium">
              {lobang.from_display_name ?? "A teammate"}
            </span>
            <span className="text-stone"> recommends </span>
            {lobang.place ? (
              <Link
                href={`/places/${lobang.place_id}`}
                className="text-ember font-medium hover:underline"
              >
                {lobang.place.name}
              </Link>
            ) : (
              <span className="font-medium">a place</span>
            )}
            <span className="text-stone"> for you</span>
            {!lobang.seen_at && (
              <span className="bg-ember ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white">
                New
              </span>
            )}
          </p>

          {lobang.note && (
            <p className="text-stone mt-1 text-sm whitespace-pre-wrap italic">
              “{lobang.note}”
            </p>
          )}

          <p className="text-stone mt-1 text-xs">
            {lobang.event_title && `From ${lobang.event_title} · `}
            {lobang.created_at && relativeDayLabel(lobang.created_at)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleLike}
              disabled={busy}
              aria-pressed={!!lobang.liked_at}
              aria-label={lobang.liked_at ? "Unlike this lobang" : "Like this lobang"}
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                lobang.liked_at ? "text-ember" : "text-stone hover:text-ink"
              )}
            >
              <span aria-hidden="true">{lobang.liked_at ? "♥" : "♡"}</span>
              {lobang.liked_at ? "Liked" : "Like"}
            </button>

            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="text-stone hover:text-ember text-xs underline"
            >
              {lobang.reply ? "Edit reply" : "Reply"}
            </button>

            {lobang.place && (
              <Link
                href={`/events/new?placeId=${lobang.place_id}`}
                className="text-stone hover:text-ember text-xs underline"
              >
                Start a Jio here
              </Link>
            )}

            <button
              type="button"
              onClick={() => onDismiss(lobang.id)}
              className="text-stone hover:text-ink ml-auto text-xs underline"
            >
              Dismiss
            </button>
          </div>

          {!replying && lobang.reply && (
            <p className="text-stone mt-1.5 text-xs">
              You replied: <span className="text-ink italic">“{lobang.reply}”</span>
            </p>
          )}

          {replying && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Send a reply…"
                className="border-line bg-paper w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-xs"
              />
              <Button size="sm" onClick={sendReply} disabled={busy || !replyText.trim()}>
                Send
              </Button>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}

/**
 * Lobangs sent to you, plus a short history of ones you've sent. Always
 * targeted — either to specific teammates or to a whole Kaki at once — never
 * a broadcast to the entire team.
 */
export default function LobangInbox() {
  const {
    data: received,
    error: receivedError,
    mutate: mutateReceived,
  } = useSWR<{
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

  // UX review log #7 — same tier as PastJios: lobangs sent to you are
  // content someone else acted on, not a decorative nudge, so a failed
  // fetch shouldn't just make them disappear.
  if (receivedError) {
    return (
      <section>
        <SectionHeading>Lobangs for you</SectionHeading>
        <Card className="flex items-center justify-between gap-3">
          <p className="text-stone flex items-center gap-2 text-sm">
            <AlertIcon className="text-ember h-4 w-4 shrink-0" aria-hidden="true" />
            Couldn&apos;t load your lobangs.
          </p>
          <Button variant="secondary" size="sm" onClick={() => mutateReceived()}>
            Try again
          </Button>
        </Card>
      </section>
    );
  }

  if (inbox.length === 0 && history.length === 0) return null;

  return (
    <section className="space-y-4">
      {inbox.length > 0 && (
        <div>
          <SectionHeading
            action={
              <Link href="/lobangs" className="text-ember text-xs underline">
                See all
              </Link>
            }
          >
            Lobangs for you
          </SectionHeading>
          <ul className="space-y-2">
            {inbox.map((l) => (
              <ReceivedLobangCard
                key={l.id}
                lobang={l}
                onChanged={() => mutateReceived()}
                onDismiss={dismiss}
              />
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <SectionHeading
            action={
              !inbox.length ? (
                <Link href="/lobangs" className="text-ember text-xs underline">
                  See all
                </Link>
              ) : undefined
            }
          >
            Lobangs you sent
          </SectionHeading>
          <ul className="space-y-1.5">
            {history.map((l) => (
              <li
                key={l.id}
                className="text-stone flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">
                  To {l.to_display_name ?? "a teammate"}:{" "}
                  <span className="text-ink">
                    {l.place?.name ?? "a place"}
                  </span>
                  {l.liked_at && <span className="text-ember"> · liked</span>}
                  {l.reply && <span className="text-ember"> · replied</span>}
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
