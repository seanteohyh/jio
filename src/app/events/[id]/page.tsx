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
import ShareLink from "@/components/ShareLink";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { eventInviteUrl } from "@/lib/shareUrl";
import { subscribeToEventChanges } from "@/lib/realtime";
import { features } from "@/lib/config";
import { formatDate, formatDateTime } from "@/lib/utils";
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
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedThisSession, setSuggestedThisSession] = useState<string[]>([]);
  const [newCandidateDate, setNewCandidateDate] = useState("");
  const [justConfirmedDate, setJustConfirmedDate] = useState<string | null>(null);

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
  const isDatePolling = event.date_phase === "polling";

  const myAvailability = new Set(
    event.dateVotes.filter((v) => v.user_id === viewer.id).map((v) => v.date)
  );

  // Vote counts per candidate date, so the host's confirm step (and
  // everyone else) can see which date is leading.
  const availabilityCounts = new Map<string, number>();
  for (const candidate of event.candidateDates) {
    availabilityCounts.set(
      candidate.date,
      event.dateVotes.filter((v) => v.date === candidate.date).length
    );
  }
  const leadingDate = event.candidateDates.reduce<string | null>(
    (leader, candidate) => {
      if (!leader) return candidate.date;
      const leaderCount = availabilityCounts.get(leader) ?? 0;
      const count = availabilityCounts.get(candidate.date) ?? 0;
      return count > leaderCount ? candidate.date : leader;
    },
    null
  );

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

  const suggestOptions = () =>
    run(async () => {
      setSuggesting(true);
      try {
        const result = await mutateJson<{ added: { place_id: string }[] }>(
          `/api/events/${id}/suggest-options`,
          "POST",
          { exclude_place_ids: suggestedThisSession }
        );
        setSuggestedThisSession((prev) => [
          ...prev,
          ...result.added.map((o) => o.place_id),
        ]);
        setBallotTouched(false);
      } finally {
        setSuggesting(false);
      }
    });

  const toggleAvailability = (date: string) =>
    run(async () => {
      const next = myAvailability.has(date)
        ? Array.from(myAvailability).filter((d) => d !== date)
        : [...Array.from(myAvailability), date];
      await mutateJson(`/api/events/${id}/availability`, "POST", {
        dates: next,
      });
    });

  const addCandidateDate = () =>
    run(async () => {
      if (!newCandidateDate) return;
      await mutateJson(`/api/events/${id}/candidate-dates`, "POST", {
        date: newCandidateDate,
      });
      setNewCandidateDate("");
    });

  const confirmDate = (date: string) =>
    run(async () => {
      await mutateJson(`/api/events/${id}/confirm-date`, "POST", { date });
      setJustConfirmedDate(date);
      window.setTimeout(() => setJustConfirmedDate(null), 4000);
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
            <p className="text-stone mt-1 text-sm">
              {isDatePolling
                ? `Picking a date — ${event.candidateDates.length} option${event.candidateDates.length === 1 ? "" : "s"}`
                : formatDateTime(event.scheduled_at)}
              {event.host_name && ` · hosted by ${event.host_name}`}
            </p>
          </div>
          <Chip className={isOpen ? "" : "bg-line"}>
            {isDatePolling ? "Picking a date" : isOpen ? "Open" : "Closed"}
          </Chip>
        </div>
      </header>

      {/*
        Share sits directly under the header, not at the foot of the page.
        Inviting people is the whole reason a Jio exists, and buried at the
        bottom of a long vote list it was effectively invisible.
      */}
      {isOpen && event.invite_token && (
        <ShareLink
          url={eventInviteUrl(event.invite_token)}
          label="Share this Jio"
          shareText={`${event.title} — come vote on where we eat.`}
        />
      )}

      {justConfirmedDate && (
        <Card className="border-sage/40 bg-sage-tint/70 animate-fade-in">
          <p className="text-sm font-medium">
            Confirmed for {formatDate(justConfirmedDate)}!
          </p>
        </Card>
      )}

      {!isOpen && (
        <Card className="border-sage/40 bg-sage-tint/70">
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

      {/* --- Flexi Jio: date polling --- */}
      {isOpen && isDatePolling && (
        <Card className="space-y-3">
          <SectionHeading>When works for you?</SectionHeading>
          <p className="text-stone text-xs">
            Mark every date you&apos;re free.{" "}
            {viewer.isHost && "You'll confirm one once enough people have answered."}
          </p>

          <ul className="space-y-1.5">
            {event.candidateDates.map((candidate) => {
              const free = myAvailability.has(candidate.date);
              const count = availabilityCounts.get(candidate.date) ?? 0;
              const isLeading =
                candidate.date === leadingDate && count > 0;
              return (
                <li key={candidate.date}>
                  <button
                    type="button"
                    onClick={() => toggleAvailability(candidate.date)}
                    disabled={busy}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                      (free
                        ? "border-ember bg-ember/10"
                        : "border-line bg-cream/60 hover:border-ember/40")
                    }
                  >
                    <span>
                      {formatDate(candidate.date)}
                      {isLeading && (
                        <span className="text-ember ml-1.5 text-xs font-medium">
                          Leading
                        </span>
                      )}
                    </span>
                    <span className="text-stone text-xs tabular-nums">
                      {free ? "You're free ✓" : "Mark free"} · {count}{" "}
                      {count === 1 ? "person" : "people"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {viewer.canAddOptions && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="date"
                value={newCandidateDate}
                onChange={(e) => setNewCandidateDate(e.target.value)}
                className={inputClass}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={addCandidateDate}
                disabled={busy || !newCandidateDate}
              >
                Add date
              </Button>
            </div>
          )}

          {viewer.isHost && (
            <div className="border-line space-y-2 border-t pt-3">
              <p className="text-stone text-xs">
                Confirm a date — any candidate, not just the leader.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {event.candidateDates.map((candidate) => (
                  <Button
                    key={candidate.date}
                    size="sm"
                    variant={candidate.date === leadingDate ? "primary" : "secondary"}
                    onClick={() => confirmDate(candidate.date)}
                    disabled={busy}
                  >
                    Confirm {formatDate(candidate.date)}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* --- RSVP --- */}
      {isOpen && !isDatePolling && (
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
              <span className="text-stone text-xs">
                {event.going_count ?? 0} going
              </span>
            </div>
          )}
        </Card>
      )}

      {/* --- Standing --- */}
      {!isDatePolling && (
      <Card>
        <SectionHeading>
          {isOpen ? "Standing" : "Final count"}
        </SectionHeading>
        <p className="text-stone mb-3 text-xs">
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
                    className={isWinner ? "text-sage font-medium" : ""}
                  >
                    {option.place?.name ?? "Unknown place"}
                    {isWinner && " ✓"}
                    {option.is_suggested && (
                      <span className="bg-ember/15 text-ember ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                        Suggested
                      </span>
                    )}
                  </span>
                  <span className="text-stone shrink-0 text-xs tabular-nums">
                    {points} pt{points === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="bg-paper mt-1 h-2 overflow-hidden rounded-full">
                  <div
                    className={
                      isWinner ? "bg-sage h-full" : "bg-ember h-full"
                    }
                    style={{ width: `${(points / maxPoints) * 100}%` }}
                  />
                </div>
                {option.added_by_name && (
                  <p className="text-stone mt-0.5 text-[11px]">
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
      )}

      {/* --- Ballot --- */}
      {isOpen && !isDatePolling && orderedBallot.length > 0 && (
        <Card>
          <SectionHeading>Your ranking</SectionHeading>
          <p className="text-stone mb-3 text-xs">
            Order them best first. You do not have to rank all of them.
          </p>

          <ol className="space-y-1.5">
            {orderedBallot.map((placeId, index) => {
              const option = event.options.find((o) => o.place_id === placeId);
              return (
                <li
                  key={placeId}
                  className="border-line bg-paper flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="text-stone w-5 shrink-0 text-xs tabular-nums">
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
                      className="text-stone hover:text-ink px-1.5 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === orderedBallot.length - 1}
                      aria-label="Move down"
                      className="text-stone hover:text-ink px-1.5 disabled:opacity-30"
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
      {viewer.canAddOptions && !isDatePolling && (
        <Card>
          <SectionHeading>Add a place</SectionHeading>

          <div className="mb-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={suggestOptions}
              disabled={suggesting}
            >
              {suggesting
                ? "Thinking…"
                : suggestedThisSession.length > 0
                  ? "Re-roll"
                  : "Can't decide? Suggest 3"}
            </Button>
            {suggestedThisSession.length > 0 && (
              <p className="text-stone mt-1.5 text-xs">
                Re-rolling swaps out whatever nobody&apos;s voted on yet —
                anything with a vote already stays put.
              </p>
            )}
          </div>

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
                    className="hover:bg-paper flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                  >
                    <span className="truncate">{place.name}</span>
                    <span className="text-stone shrink-0 text-xs">
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
              <p className="text-stone mb-1.5 text-xs">Remove</p>
              <div className="flex flex-wrap gap-1.5">
                {event.options
                  .filter((o) => viewer.isHost || o.added_by === viewer.id)
                  .map((option) => (
                    <button
                      key={option.place_id}
                      type="button"
                      onClick={() => removeOption(option.place_id)}
                      disabled={busy}
                      className="border-line text-stone rounded-full border px-2.5 py-1 text-xs hover:border-ember hover:text-ember"
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
      {viewer.isHost && isOpen && !isDatePolling && (
        <Card className="space-y-3">
          <SectionHeading>Close it</SectionHeading>
          <p className="text-stone text-xs">
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
              <p className="text-stone mb-3 text-xs">
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

    </div>
  );
}
