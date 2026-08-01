"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  inputClass,
} from "@/components/ui";
import InvitePicker, {
  type InviteSelection,
} from "@/components/InvitePicker";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { Place } from "@/types";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 0, label: "Sun" },
  { value: 6, label: "Sat" },
];

type Mode = "fixed" | "vote";

/**
 * Create a standing weekly Jio — CHANGES_20260801.md §10, "Recurring Jios —
 * extended." A series is a generator, not a Jio itself: it produces an
 * ordinary open Jio each week via the exact same `createEvent` a one-off
 * Jio uses, so everything downstream (voting, RSVP, closing, cancelling)
 * already just works on whatever comes out of it.
 */
export default function NewRecurringSeriesPage() {
  const router = useRouter();

  const [title, setTitle] = useState("Lunch");
  const [weekday, setWeekday] = useState(3);
  const [time, setTime] = useState("12:15");
  const [mode, setMode] = useState<Mode>("fixed");
  const [fixedPlaceId, setFixedPlaceId] = useState<string | null>(null);
  const [votePlaceIds, setVotePlaceIds] = useState<string[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [invite, setInvite] = useState<InviteSelection>({
    userIds: [],
    kakiIds: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = placeQuery.trim();
  const { data: searchData } = useSWR<{ places: Place[] }>(
    trimmedQuery.length >= 2
      ? `/api/places?q=${encodeURIComponent(trimmedQuery)}`
      : null,
    fetcher
  );
  const results = useMemo(() => searchData?.places ?? [], [searchData]);

  const toggleVotePlace = (id: string) =>
    setVotePlaceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === "fixed" && !fixedPlaceId) {
      setError("Search for the place this is always at, and pick it");
      return;
    }
    if (mode === "vote" && votePlaceIds.length === 0) {
      setError("Pick at least one place to vote on each time");
      return;
    }

    setBusy(true);
    try {
      await mutateJson("/api/recurring-series", "POST", {
        title: title.trim() || "Lunch",
        weekday,
        time_of_day: time,
        mode,
        fixed_place_id: mode === "fixed" ? fixedPlaceId : undefined,
        option_place_ids: mode === "vote" ? votePlaceIds : undefined,
        invitee_ids: invite.userIds,
        kaki_id: invite.kakiIds[0] ?? null,
      });
      router.push("/events");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create it");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Make it a standing Jio
        </h1>
        <p className="text-stone mt-1 text-sm">
          Generates a new Jio every week — up to a few days ahead, so there&apos;s
          time to vote or just show up.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="What is it">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Standing Wednesday lunch"
            />
          </Field>

          <Field label="Every">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.value}
                  active={weekday === d.value}
                  onClick={() => setWeekday(d.value)}
                >
                  {d.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
            />
          </Field>
        </Card>

        <Card className="space-y-4">
          <Field label="Where">
            <div className="flex gap-1.5">
              <Chip active={mode === "fixed"} onClick={() => setMode("fixed")}>
                Same place every time
              </Chip>
              <Chip active={mode === "vote"} onClick={() => setMode("vote")}>
                Vote each time
              </Chip>
            </div>
          </Field>

          <p className="text-stone text-xs">
            {mode === "fixed"
              ? "No vote needed — it auto-confirms, same place every week. Search for it below."
              : "Every occurrence opens a ranked vote over these places, same as any other Jio."}
          </p>

          <input
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            className={inputClass}
            placeholder="Search places…"
          />

          {results.length > 0 && (
            <ul className="space-y-1">
              {results.map((place) => {
                const selected =
                  mode === "fixed"
                    ? fixedPlaceId === place.id
                    : votePlaceIds.includes(place.id);
                return (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() =>
                        mode === "fixed"
                          ? setFixedPlaceId(place.id)
                          : toggleVotePlace(place.id)
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                        selected ? "bg-ember-tint text-ember-tint-text" : "hover:bg-paper"
                      }`}
                    >
                      <span className="truncate">{place.name}</span>
                      {selected && <span className="shrink-0">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {mode === "fixed" && fixedPlaceId && (
            <p className="text-stone text-xs">
              Picked: {results.find((p) => p.id === fixedPlaceId)?.name ?? fixedPlaceId}
            </p>
          )}
          {mode === "vote" && votePlaceIds.length > 0 && (
            <p className="text-stone text-xs">{votePlaceIds.length} selected</p>
          )}
        </Card>

        <Card className="space-y-3">
          <Field label="Who is coming">
            <InvitePicker value={invite} onChange={setInvite} />
          </Field>
          <p className="text-stone text-xs">
            Whoever&apos;s in the group when each week&apos;s Jio generates gets
            invited — not frozen from today, so it stays current as the group
            changes.
          </p>
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Start the series"}
          </Button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-stone text-sm underline"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
