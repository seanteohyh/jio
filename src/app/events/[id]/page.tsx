"use client";

import { use, useEffect, useState } from "react";
import useSWR from "swr";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorNote,
  SectionHeading,
  Spinner,
  inputClass,
} from "@/components/ui";
import RouletteWheel from "@/components/RouletteWheel";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { subscribeToEventChanges } from "@/lib/realtime";
import { features } from "@/lib/config";
import { formatDateTime } from "@/lib/utils";
import type { EventDetail, Place, RsvpResponse } from "@/types";

interface EventResponse {
  event: EventDetail;
  viewer: {
    id: string;
    isHost: boolean;
    canAddOptions: boolean;
    myVote: string[];
    myRsvp: RsvpResponse | null;
  };
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, error, isLoading, mutate } = useSWR<EventResponse>(
    `/api/events/${id}`,
    fetcher
  );

  const [ballot, setBallot] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWheel, setShowWheel] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [ballotTouched, setBallotTouched] = useState(false);

  // Live updates while people vote. Falls back silently if realtime is off.
  useEffect(() => {
    return subscribeToEventChanges(id, () => mutate());
  }, [id, mutate]);

  // Seed the ballot from the server once, then leave it alone so a realtime
  // refresh cannot yank options out from under someone mid-drag.
  useEffect(() => {
    if (!data || ballotTouched) return;
    setBallot(
      data.viewer.myVote.length > 0
        ? data.viewer.myVote
        : data.event.options.map((o) => o.place_id)
    );
  }, [data, ballotTouched]);

  const { data: placesData } = useSWR<{ places: Place[] }>(
    data?.viewer.canAddOptions ? "/api/places" : null,
    fetcher
  );

  if (isLoading) return <Spinner label="Loading" />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return null;

  const { event, viewer } = data;
  const isOpen = event.status === "open";

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ballot.length) return;
    const next = [...ballot];
    [next[index], next[target]] = [next[target], next[index]];
    setBallot(next);
    setBallotTouched(true);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something failed");
    } finally {
      setBusy(false);
    }
  };

  const submitBallot = () =>
    run(() =>
      mutateJson(`/api/events/${id}/vote`, "POST", {
        ranked_place_ids: ballot,
      })
    );

  const sendRsvp = (response: RsvpResponse) =>
    run(() => mutateJson(`/api/events/${id}/rsvp`, "POST", { response }));

  const addOption = (placeId: string) =>
    run(async () => {
      await mutateJson(`/api/events/${id}/options`, "POST", {
        place_id: placeId,
      });
      setAddQuery("");
      setBallotTouched(false);
    });

  const removeOption = (placeId: string) =>
    run(async () => {
      await mutateJson(
        `/api/events/${id}/options?placeId=${placeId}`,
        "DELETE"
      );
      setBallotTouched(false);
    });

  const close = (winnerPlaceId?: string) =>
    run(() =>
      mutateJson(`/api/events/${id}/close`, "POST", {
        winner_place_id: winnerPlaceId ?? null,
      })
    );

  const optionPlaces = event.options
    .map((o) => o.place)
    .filter((p): p is Place => Boolean(p));

  const tally = event.tally ?? {};
  const maxPoints = Math.max(1, ...Object.values(tally));
  const voterCount = new Set(event.votes.map((v) => v.user_id)).size;

  const orderedBallot = ballot.filter((placeId) =>
    event.options.some((o) => o.place_id === placeId)
  );

  const addCandidates = (placesData?.places ?? [])
    .filter((p) => !event.options.some((o) => o.place_id === p.id))
    .filter((p) =>
      addQuery ? p.name.toLowerCase().includes(addQuery.toLowerCase()) : false
    )
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {event.title}
            </h1>
            <p className="text-dolch-muted mt-1 text-sm">
              {formatDateTime(event.scheduled_at)}
              {event.host_name && ` · hosted by ${event.host_name}`}
            </p>
          </div>
          <Chip className={isOpen ? "" : "bg-dolch-border"}>
            {isOpen ? "Open" : "Closed"}
          </Chip>
        </div>
      </header>

      {!isOpen && (
        <Card className="border-dolch-success/40 bg-green-50/60">
          {event.winner_place_name ? (
            <p className="text-sm">
              <span className="font-medium">Decided:</span>{" "}
              {event.winner_place_name}
            </p>
          ) : (
            <p className="text-sm">
              Closed without a winner — nobody voted in time.
            </p>
          )}
        </Card>
      )}

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      {/* --- RSVP --- */}
      {isOpen && (
        <Card>
          <SectionHeading>Are you coming?</SectionHeading>
          <div className="flex gap-2">
            {(["yes", "maybe", "no"] as RsvpResponse[]).map((response) => (
              <Button
                key={response}
                size="sm"
                variant={viewer.myRsvp === response ? "primary" : "secondary"}
                onClick={() => sendRsvp(response)}
                disabled={busy}
              >
                {response === "yes"
                  ? "I'm in"
                  : response === "maybe"
                    ? "Maybe"
                    : "Can't"}
              </Button>
            ))}
          </div>

          {event.rsvps.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {event.rsvps
                .filter((r) => r.response === "yes")
                .map((rsvp) => (
                  <span
                    key={rsvp.user_id}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Avatar
                      name={rsvp.display_name ?? "Teammate"}
                      id={rsvp.user_id}
                      size={22}
                    />
                    {rsvp.display_name}
                  </span>
                ))}
              <span className="text-dolch-muted text-xs">
                {event.going_count ?? 0} going
              </span>
            </div>
          )}
        </Card>
      )}

      {/* --- Standing --- */}
      <Card>
        <SectionHeading>
          {isOpen ? "Standing" : "Final count"}
        </SectionHeading>
        <p className="text-dolch-muted mb-3 text-xs">
          {voterCount === 0
            ? "Nobody has voted yet."
            : `${voterCount} ballot${voterCount === 1 ? "" : "s"} in. Points come from everyone's rankings, not just first choices.`}
        </p>

        <ul className="space-y-2">
          {event.options.map((option) => {
            const points = tally[option.place_id] ?? 0;
            const isWinner = event.winner_place_id === option.place_id;
            return (
              <li key={option.place_id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={isWinner ? "text-dolch-success font-medium" : ""}
                  >
                    {option.place?.name ?? "Unknown place"}
                    {isWinner && " ✓"}
                  </span>
                  <span className="text-dolch-muted shrink-0 text-xs tabular-nums">
                    {points} pt{points === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="bg-dolch-bg mt-1 h-2 overflow-hidden rounded-full">
                  <div
                    className={
                      isWinner ? "bg-dolch-success h-full" : "bg-dolch-accent h-full"
                    }
                    style={{ width: `${(points / maxPoints) * 100}%` }}
                  />
                </div>
                {option.added_by_name && (
                  <p className="text-dolch-muted mt-0.5 text-[11px]">
                    added by {option.added_by_name}
                    {typeof option.place?.walk_minutes === "number" &&
                      ` · ${option.place.walk_minutes} min walk`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* --- Ballot --- */}
      {isOpen && orderedBallot.length > 0 && (
        <Card>
          <SectionHeading>Your ranking</SectionHeading>
          <p className="text-dolch-muted mb-3 text-xs">
            Order them best first. You do not have to rank all of them.
          </p>

          <ol className="space-y-1.5">
            {orderedBallot.map((placeId, index) => {
              const option = event.options.find((o) => o.place_id === placeId);
              return (
                <li
                  key={placeId}
                  className="border-dolch-border bg-dolch-bg flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="text-dolch-muted w-5 shrink-0 text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {option?.place?.name ?? "Unknown"}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="text-dolch-muted hover:text-dolch-text px-1.5 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === orderedBallot.length - 1}
                      aria-label="Move down"
                      className="text-dolch-muted hover:text-dolch-text px-1.5 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          <Button className="mt-3" onClick={submitBallot} disabled={busy}>
            {viewer.myVote.length > 0 ? "Update my vote" : "Submit my vote"}
          </Button>
        </Card>
      )}

      {/* --- Add options --- */}
      {viewer.canAddOptions && (
        <Card>
          <SectionHeading>Add a place</SectionHeading>
          <input
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            className={inputClass}
            placeholder="Search places to add…"
          />

          {addCandidates.length > 0 && (
            <ul className="mt-2 space-y-1">
              {addCandidates.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => addOption(place.id)}
                    disabled={busy}
                    className="hover:bg-dolch-bg flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                  >
                    <span className="truncate">{place.name}</span>
                    <span className="text-dolch-muted shrink-0 text-xs">
                      {place.walk_minutes} min
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Removing your own suggestion. The host can remove any. */}
          {event.options.some(
            (o) => o.added_by === viewer.id || viewer.isHost
          ) && (
            <div className="mt-3">
              <p className="text-dolch-muted mb-1.5 text-xs">Remove</p>
              <div className="flex flex-wrap gap-1.5">
                {event.options
                  .filter((o) => viewer.isHost || o.added_by === viewer.id)
                  .map((option) => (
                    <button
                      key={option.place_id}
                      type="button"
                      onClick={() => removeOption(option.place_id)}
                      disabled={busy}
                      className="border-dolch-border text-dolch-muted rounded-full border px-2.5 py-1 text-xs hover:border-red-300 hover:text-red-700"
                    >
                      {option.place?.name} ×
                    </button>
                  ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* --- Host controls --- */}
      {viewer.isHost && isOpen && (
        <Card className="space-y-3">
          <SectionHeading>Close it</SectionHeading>
          <p className="text-dolch-muted text-xs">
            Locks the vote and announces the winner. The Borda count decides
            unless you override it.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => close()} disabled={busy}>
              Close with the vote
            </Button>
            {features.roulette && optionPlaces.length > 1 && (
              <Button
                variant="secondary"
                onClick={() => setShowWheel((s) => !s)}
              >
                {showWheel ? "Hide wheel" : "Spin instead"}
              </Button>
            )}
          </div>

          {showWheel && (
            <div className="pt-2">
              <p className="text-dolch-muted mb-3 text-xs">
                When the vote is deadlocked or nobody cares enough to rank. The
                spin picks and closes.
              </p>
              <RouletteWheel
                places={optionPlaces}
                onResult={(place) => close(place.id)}
                disabled={busy}
              />
            </div>
          )}
        </Card>
      )}

      {/* --- Share --- */}
      {isOpen && (
        <p className="text-dolch-muted text-xs">
          Share this Jio:{" "}
          <code className="bg-dolch-surface rounded px-1.5 py-0.5">
            /e/{event.invite_token}
          </code>
        </p>
      )}
    </div>
  );
}
