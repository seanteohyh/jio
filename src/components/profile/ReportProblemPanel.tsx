"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { mutateJson } from "@/lib/fetcher";
import type { GeneralReportCategory } from "@/types";

const CATEGORY_LABELS: Record<GeneralReportCategory, string> = {
  not_working: "Something's not working",
  place_wrong: "A place's info is wrong",
  other: "Something else",
};

/**
 * UX review log #17 — "Report a problem," rescoped from a full help/FAQ
 * page (no vocabulary glossary or auto-close explainer — content nobody
 * had the facts to write accurately) down to the one genuinely useful
 * piece: a fast path to tell you something's wrong, reusing the same
 * report mechanism already powering Places' "Report an issue" panel
 * (`/api/reports`, generalised with a `category` field) rather than a
 * second, parallel reporting system.
 */
export default function ReportProblemPanel() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<GeneralReportCategory>(
    "not_working"
  );
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const showToast = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/reports", "POST", {
        category,
        comment: comment.trim() || undefined,
      });
      setComment("");
      setCategory("not_working");
      setOpen(false);
      setSent(true);
      showToast("Report sent — thanks for flagging it.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send that report"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setSent(false);
        }}
        className="text-ember text-sm underline"
      >
        {open ? "Never mind" : "Report a problem"}
      </button>

      {sent && !open && (
        <p className="text-sage mt-2 text-xs">
          Sent — thanks for flagging it.
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          {/* A `<fieldset>`/`<legend>`, not `Field` — `Field` wraps its
              children in its own `<label>`, which is invalid HTML around a
              radio group where each option is already its own `<label>`
              (confirmed live: it broke each radio's accessible name into a
              garbled merge of the group heading and its own text). */}
          <fieldset className="space-y-1.5">
            <legend className="text-stone mb-1 text-xs font-medium">
              What&apos;s this about?
            </legend>
            {(Object.keys(CATEGORY_LABELS) as GeneralReportCategory[]).map(
              (key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="report-category"
                    value={key}
                    checked={category === key}
                    onChange={() => setCategory(key)}
                    className="accent-ember"
                  />
                  {CATEGORY_LABELS[key]}
                </label>
              )
            )}
          </fieldset>

          <Field label="Details">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`${inputClass} min-h-20`}
              placeholder="What happened?"
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Sending…" : "Send report"}
          </Button>
        </form>
      )}
    </div>
  );
}
