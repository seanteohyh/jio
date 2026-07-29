"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, Card, ErrorNote, Field, inputClass } from "../ui";
import { fetcher } from "@/lib/fetcher";
import type { Kaki, Place, ScoredPlace } from "@/types";

/**
 * Start a Jio without leaving the home page.
 *
 * Deliberately three fields and one button. The full form at /events/new
 * exists for the times you want to fiddle; this exists for the 11:40am case
 * where somebody just needs to get lunch moving.
 *
 * Place options are pre-filled from the recommender's top picks, so the common
 * path is: open, name it, send.
 */
export default function StartJioWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Lunch");
  const [time, setTime] = useState("12:15");
  const [kakiId, setKakiId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suggestData } = useSWR<{ suggestions: ScoredPlace[] }>(
    open ? "/api/suggest?limit=6" : null,
    fetcher
  );
  const { data: kakiData } = useSWR<{ kakis: Kaki[] }>(
    open ? "/api/kakis" : null,
    fetcher
  );

  const candidates: Place[] =
    suggestData?.suggestions.map((s) => s.place) ?? [];

  // Pre-select the top three once suggestions land — but exactly once. Without
  // the ref this would re-select every time SWR revalidates, undoing whatever
  // the user had just changed.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || candidates.length === 0) return;
    prefilled.current = true;
    setSelected(candidates.slice(0, 3).map((p) => p.id));
  }, [candidates]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // Time input gives "HH:MM" — attach it to today, in local time.
      const [hours, minutes] = time.split(":").map(Number);
      const when = new Date();
      when.setHours(hours ?? 12, minutes ?? 15, 0, 0);

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Lunch",
          scheduled_at: when.toISOString(),
          place_ids: selected,
          kaki_id: kakiId || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not start it");

      router.push(`/events/${payload.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)}>
        Start a Jio
      </Button>
    );
  }

  return (
    <Card className="animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Start a Jio</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-dolch-muted text-sm underline"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="What for">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Lunch"
          />
        </Field>
        <Field label="When">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {kakiData?.kakis && kakiData.kakis.length > 0 && (
        <Field label="With" hint="Everyone in the group can add and vote.">
          <select
            value={kakiId}
            onChange={(e) => setKakiId(e.target.value)}
            className={inputClass}
          >
            <option value="">Just people I invite</option>
            {kakiData.kakis.map((kaki) => (
              <option key={kaki.id} value={kaki.id}>
                {kaki.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <p className="text-dolch-text mb-1 text-sm font-medium">
          Options to vote on
        </p>
        <p className="text-dolch-muted mb-2 text-xs">
          Pre-filled from your top picks. Tap to change.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {candidates.length === 0 && (
            <span className="text-dolch-muted text-xs">Loading picks…</span>
          )}
          {candidates.map((place) => {
            const active = selected.includes(place.id);
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => toggle(place.id)}
                className={
                  active
                    ? "bg-dolch-accent rounded-full px-2.5 py-1 text-xs text-white"
                    : "border-dolch-border text-dolch-muted hover:border-dolch-accent rounded-full border px-2.5 py-1 text-xs"
                }
              >
                {place.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button
        className="w-full"
        onClick={submit}
        disabled={submitting || selected.length === 0}
      >
        {submitting ? "Starting…" : `Start it (${selected.length} options)`}
      </Button>
    </Card>
  );
}
