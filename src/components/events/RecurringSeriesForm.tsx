"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, Card, Chip, ErrorNote, Field, inputClass } from "@/components/ui";
import InvitePicker, {
  type InviteSelection,
} from "@/components/InvitePicker";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { Place, RecurringSeries } from "@/types";

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
 * The one create/edit form for a standing weekly Jio — CHANGES_20260819b.md
 * §3. Previously creation-only (`/events/recurring/new`); editing existed
 * nowhere, so changing anything meant stopping the series and starting a
 * fresh one, losing its history link in the process. Same fix already used
 * for the one-off Jio form (`JioForm`, shared between `/events/new` and
 * Home's inline wizard): one component, parameterized by an optional
 * existing series to edit, rather than a second bespoke screen.
 *
 * Editing propagates onto any already-generated, still-open occurrence —
 * see `updateRecurringSeries`'s doc comment for exactly what moves. That
 * logic lives entirely server-side; this form just resubmits the full
 * field set either way, same shape POST and PATCH both take.
 */
export default function RecurringSeriesForm({
  initialSeries,
}: {
  initialSeries?: RecurringSeries;
}) {
  const router = useRouter();
  const isEditing = Boolean(initialSeries);

  const [title, setTitle] = useState(initialSeries?.title ?? "Lunch");
  const [weekday, setWeekday] = useState(initialSeries?.weekday ?? 3);
  const [time, setTime] = useState(initialSeries?.time_of_day.slice(0, 5) ?? "12:00");
  const [mode, setMode] = useState<Mode>(initialSeries?.mode ?? "fixed");
  const [fixedPlaceId, setFixedPlaceId] = useState<string | null>(
    initialSeries?.fixed_place_id ?? null
  );
  const [votePlaceIds, setVotePlaceIds] = useState<string[]>(
    initialSeries?.option_place_ids ?? []
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [invite, setInvite] = useState<InviteSelection>({
    userIds: initialSeries?.invitee_ids ?? [],
    kakiIds: initialSeries?.kaki_id ? [initialSeries.kaki_id] : [],
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

  // Editing starts with only place *ids* (fixed_place_id / option_place_ids)
  // — no names to show until either a matching search happens to run, or
  // this resolves them once, directly, the same way InvitePicker resolves
  // pre-selected people it hasn't searched for.
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>(
    {}
  );
  useEffect(() => {
    if (!initialSeries) return;
    const ids =
      initialSeries.mode === "fixed"
        ? initialSeries.fixed_place_id
          ? [initialSeries.fixed_place_id]
          : []
        : initialSeries.option_place_ids;
    if (ids.length === 0) return;
    let cancelled = false;
    Promise.all(
      ids.map((id) =>
        fetch(`/api/places/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [id, d?.place?.name as string | undefined] as const)
      )
    ).then((pairs) => {
      if (cancelled) return;
      setResolvedNames((prev) => ({
        ...prev,
        ...Object.fromEntries(
          pairs.filter((p): p is [string, string] => Boolean(p[1]))
        ),
      }));
    });
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once, off the series this form opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameFor = (id: string) =>
    results.find((p) => p.id === id)?.name ?? resolvedNames[id] ?? id;

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
      const body = {
        title: title.trim() || "Lunch",
        weekday,
        time_of_day: time,
        mode,
        fixed_place_id: mode === "fixed" ? fixedPlaceId : undefined,
        option_place_ids: mode === "vote" ? votePlaceIds : undefined,
        invitee_ids: invite.userIds,
        kaki_id: invite.kakiIds[0] ?? null,
      };
      if (isEditing) {
        await mutateJson(
          `/api/recurring-series/${initialSeries!.id}`,
          "PATCH",
          body
        );
      } else {
        await mutateJson("/api/recurring-series", "POST", body);
      }
      router.push("/events");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not ${isEditing ? "save" : "create"} it`
      );
      setBusy(false);
    }
  };

  return (
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
          {isEditing && (
            <p className="text-stone mt-1.5 text-xs">
              Only changes what generates from now on — it never moves a
              Jio that&apos;s already been generated.
            </p>
          )}
        </Field>

        <Field label="Time">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`${inputClass} min-w-0`}
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
            Picked: {nameFor(fixedPlaceId)}
          </p>
        )}
        {mode === "vote" && votePlaceIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {votePlaceIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleVotePlace(id)}
                // UX review log #3 — the report claimed this was already
                // correct (hides the × from screen readers), but it never
                // added "Remove" anywhere, so the accessible name was still
                // just the place name. Fixed for real with aria-label.
                aria-label={`Remove ${nameFor(id)}`}
                className="bg-ember-tint text-ember-tint-text flex items-center gap-1 rounded-full px-2.5 py-3.5 text-xs"
              >
                {nameFor(id)}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
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

      {isEditing && (
        <p className="text-stone text-xs">
          A Jio this series already generated only picks up these changes
          (except the weekday) while it's still open and nobody's voted or
          RSVP'd yet — once someone has, that one's left as it is.
        </p>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy
            ? isEditing
              ? "Saving…"
              : "Creating…"
            : isEditing
              ? "Save changes"
              : "Start the series"}
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
  );
}
