"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, Button } from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { cn, relativeDayLabel } from "@/lib/utils";
import type { Lobang, LobangComment } from "@/types";

/**
 * A lobang's own reactions and shared comment thread (096_lobang_comments.sql)
 * — heart it (recipient only), jump straight into starting a Jio at that
 * place (recipient only), and a real multi-message thread the sender and
 * every recipient of a targeted send can all read and post in, back and
 * forth. Replaces the old model of one private, overwrite-in-place `reply`
 * per recipient, which a real report ("tried to reply a reply") confirmed
 * read as a bug, not a deliberate one-shot design — only one message ever
 * existed, and the sender could never post back into it at all.
 *
 * Shared between `LobangInbox` (the profile page's card layout) and
 * `/lobangs` (the full browse feed's message-bubble layout), and — since a
 * thread is no longer recipient-only — usable on both a received card and
 * the sender's own sent bubble, via `canReact`.
 */
export default function LobangReactions({
  lobang,
  onChanged,
  onDismiss,
  canReact = true,
  tone = "light",
}: {
  lobang: Lobang;
  onChanged: () => void;
  onDismiss?: (id: string) => void;
  /** Off for the sender's own view of a lobang they sent — liking your own
   *  tip, or "starting a Jio" from your own recommendation, isn't a real
   *  action; the comment thread stays available either way. */
  canReact?: boolean;
  /** "light" (default) sits on a `bg-cream`/white card. "dark" sits on the
   *  `bg-ember` sent-message bubble `/lobangs` uses — same content, just
   *  legible text against that background instead of near-invisible. */
  tone?: "light" | "dark";
}) {
  const [threadOpen, setThreadOpen] = useState(false);
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

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {canReact && (
          <button
            type="button"
            onClick={toggleLike}
            disabled={busy}
            aria-pressed={!!lobang.liked_at}
            aria-label={lobang.liked_at ? "Unlike this lobang" : "Like this lobang"}
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              lobang.liked_at
                ? tone === "dark"
                  ? "text-white"
                  : "text-ember"
                : tone === "dark"
                  ? "text-white/75 hover:text-white"
                  : "text-stone hover:text-ink"
            )}
          >
            <span aria-hidden="true">{lobang.liked_at ? "♥" : "♡"}</span>
            {lobang.liked_at ? "Liked" : "Like"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setThreadOpen((v) => !v)}
          className={cn(
            "text-xs underline",
            tone === "dark"
              ? "text-white/75 hover:text-white"
              : "text-stone hover:text-ember"
          )}
        >
          {lobang.comment_count
            ? `${lobang.comment_count} comment${lobang.comment_count === 1 ? "" : "s"}`
            : "Comment"}
        </button>

        {canReact && lobang.place && (
          <Link
            href={`/events/new?placeId=${lobang.place_id}`}
            className={cn(
              "text-xs underline",
              tone === "dark"
                ? "text-white/75 hover:text-white"
                : "text-stone hover:text-ember"
            )}
          >
            Start a Jio here
          </Link>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(lobang.id)}
            className={cn(
              "ml-auto text-xs underline",
              tone === "dark"
                ? "text-white/75 hover:text-white"
                : "text-stone hover:text-ink"
            )}
          >
            Dismiss
          </button>
        )}
      </div>

      {threadOpen && (
        <LobangThread
          lobangId={lobang.id}
          tone={tone}
          onPosted={() => {
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** The thread itself — fetched lazily, only once someone actually opens it,
 *  so a feed of a dozen lobangs doesn't fire a dozen comment fetches up
 *  front for threads nobody looks at. On `tone="dark"`, the whole thread
 *  breaks out into a light "popout" surface below the ember bubble rather
 *  than trying to re-theme every line of text against it — the same
 *  neutral-card-under-a-colored-bubble pattern other chat UIs use for a
 *  reply/reaction panel. */
function LobangThread({
  lobangId,
  onPosted,
  tone = "light",
}: {
  lobangId: string;
  onPosted: () => void;
  tone?: "light" | "dark";
}) {
  const { data, mutate, isLoading } = useSWR<{ comments: LobangComment[] }>(
    `/api/lobangs/${lobangId}/comments`,
    fetcher
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await mutateJson(`/api/lobangs/${lobangId}/comments`, "POST", {
        text: text.trim(),
      });
      setText("");
      await mutate();
      onPosted();
    } finally {
      setBusy(false);
    }
  };

  const comments = data?.comments ?? [];

  return (
    <div
      className={cn(
        "mt-2 space-y-2",
        tone === "dark"
          ? "bg-paper text-ink rounded-lg p-2.5"
          : "border-line border-t pt-2"
      )}
    >
      {isLoading ? (
        <p className="text-stone text-xs">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-stone text-xs">No comments yet — say something.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <Avatar name={c.display_name ?? "Teammate"} id={c.user_id} size={24} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium">{c.display_name ?? "Teammate"}</span>{" "}
                  <span className="text-stone">
                    {c.created_at && relativeDayLabel(c.created_at)}
                  </span>
                </p>
                <p className="text-ink text-sm whitespace-pre-wrap">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          className="border-line bg-paper w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-xs"
        />
        <Button size="sm" onClick={send} disabled={busy || !text.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
