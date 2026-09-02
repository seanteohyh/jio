"use client";

import { useState } from "react";
import { Button, Card, ErrorNote, inputClass } from "@/components/ui";
import { KopiIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { mutateJson } from "@/lib/fetcher";

/**
 * "Give feedback" — a standing, always-there entry point on Home for ideas
 * and suggestions, distinct from Profile's "Report a problem" (that one's
 * for something broken; this one's for "you should build..."). Shares the
 * same backend pipeline rather than a second one — `/api/reports`, the
 * `general_reports` table, and the admin moderation queue (migration 074
 * widened its category to add `suggestion` alongside `not_working`/
 * `place_wrong`/`other`) — so an admin resolving reports sees this in the
 * same place, just labelled distinctly.
 *
 * No category picker here, unlike `ReportProblemPanel`: every submission
 * from this card is a `suggestion` by construction, so there's nothing to
 * choose.
 */
export default function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const showToast = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) {
      setError("Say a bit about what you have in mind");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/reports", "POST", {
        category: "suggestion",
        comment: comment.trim(),
      });
      setComment("");
      setOpen(false);
      setSent(true);
      showToast("Sent — thanks!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send that"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex items-start gap-2.5">
      <KopiIcon
        className="text-ember mt-0.5 h-5 w-5 shrink-0"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">Got an idea for Jio?</p>
        <p className="text-stone mt-0.5 text-xs">
          What&apos;s missing, what&apos;s annoying, what you&apos;d love to
          see — tell us. Genuinely good suggestions get an in-person coffee,
          on us.
        </p>

        {sent && !open && (
          <p className="text-sage mt-2 text-xs">
            Sent — thanks! If it&apos;s a keeper, we&apos;ll find you for
            that coffee.
          </p>
        )}

        {!open && !sent && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-ember mt-2 text-xs underline"
          >
            Share a suggestion
          </button>
        )}

        {open && (
          <form onSubmit={submit} className="mt-2 space-y-2">
            <textarea
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`${inputClass} min-h-20`}
              placeholder="What should we build or fix?"
              aria-label="Your suggestion"
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Sending…" : "Send"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
              >
                Never mind
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
