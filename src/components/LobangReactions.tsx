"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { mutateJson } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { Lobang } from "@/types";

/**
 * A received lobang's own reactions — heart it, reply with a freeform note,
 * or jump straight into starting a Jio at that place. Shared between
 * `LobangInbox` (the profile page's card layout) and `/lobangs` (the full
 * browse feed's message-bubble layout) so both surfaces offer the exact
 * same interactions rather than the dedicated browse page staying a
 * read-only feed while the profile preview quietly has more to it.
 *
 * `onDismiss` is optional — only the profile inbox preview offers it; the
 * full `/lobangs` feed is a permanent record, nothing to dismiss from it.
 */
export default function LobangReactions({
  lobang,
  onChanged,
  onDismiss,
}: {
  lobang: Lobang;
  onChanged: () => void;
  onDismiss?: (id: string) => void;
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
    <div>
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

        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(lobang.id)}
            className="text-stone hover:text-ink ml-auto text-xs underline"
          >
            Dismiss
          </button>
        )}
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
  );
}
