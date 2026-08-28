"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, CirclePlus, MapPin } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorNote,
  LinkButton,
  SectionHeading,
  SkeletonDetail,
  inputClass,
} from "@/components/ui";
import RouletteWheel from "@/components/RouletteWheel";
import ShareLink from "@/components/ShareLink";
import ShareResultCard from "@/components/ShareResultCard";
import InvitePicker, { type InviteSelection } from "@/components/InvitePicker";
import SocialsIcon from "@/components/SocialsIcon";
import {
  LEAD_TIME_OPTIONS,
  leadTimeLabel,
} from "@/components/profile/ReminderSettingsPanel";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { eventInviteUrl } from "@/lib/shareUrl";
import { googleCalendarUrl, canAddToCalendar } from "@/lib/calendar";
import { subscribeToEventChanges } from "@/lib/realtime";
import { features } from "@/lib/config";
import {
  cn,
  formatDate,
  formatDateTime,
  googleMapsPlaceUrl,
  placeDescriptor,
  sgtDateKey,
  sgtTimeOfDay,
  socialsLabel,
} from "@/lib/utils";
import type { EventDetail, Place, RsvpResponse } from "@/types";

interface EventResponse {
  event: EventDetail;
  viewer: {
    id: string;
    isHost: boolean;
    canAddOptions: boolean;
    myVote: string[];
    myRsvp: RsvpResponse | null;
    /** Only populated when `myRsvp === "yes"` — see the route. */
    reminder: {
      enabled: boolean;
      defaultLeadMinutes: number;
      overrideLeadMinutes: number | null;
    } | null;
    /** CHANGES_20260821_combined2.md §3D — true on at most one response,
     *  ever, for a given account: see the route for the exact condition. */
    firstDecidedCelebration: boolean;
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
  // "Vote first, prompt after" (CHANGES_20260801.md §8): once a free-text
  // option is logged, this holds it so the "add it to the pool?" prompt can
  // render — cleared on decline, on accept, or by adding another option.
  const [pendingPoolPrompt, setPendingPoolPrompt] = useState<{
    placeId: string;
    label: string;
  } | null>(null);
  // CHANGES_20260819b.md — host add/remove, both before and after confirmed.
  const [inviting, setInviting] = useState(false);
  const [inviteSelection, setInviteSelection] = useState<InviteSelection>({
    userIds: [],
    kakiIds: [],
  });
  // CHANGES_20260819c.md §1/§2 — host-only corrections, available any time
  // (reschedule) or only once closed (winner place).
  const [reschedulingOpen, setReschedulingOpen] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [editingWinner, setEditingWinner] = useState(false);
  const [winnerQuery, setWinnerQuery] = useState("");
  const [editingReminder, setEditingReminder] = useState(false);

  // Live updates while people vote. Falls back silently if realtime is off.
  useEffect(() => {
    return subscribeToEventChanges(id, () => mutate());
  }, [id, mutate]);

  // The resolved-vote moment: animate only on the actual open -> closed
  // transition, not on "is closed" — otherwise it replays every time someone
  // opens a Jio that was settled last week. Watching the flip rather than
  // gating this inside close() means it also plays for everyone else when
  // the host closes it and realtime pushes the change through, which is the
  // case that matters most since they're the ones waiting to find out.
  const [justResolved, setJustResolved] = useState(false);
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    const prev = prevStatusRef.current;
    const current = data.event.status;
    if (prev === "open" && current !== "open") {
      setJustResolved(true);
    }
    prevStatusRef.current = current;
  }, [data]);

  // CHANGES_20260821_combined2.md §3D — the server only ever reports this
  // `true` once, on whichever load actually stamps it, so latch it locally
  // rather than reading `data.viewer.firstDecidedCelebration` live: any
  // later refetch on this same page (an action, a realtime push) would
  // otherwise see the now-stamped profile and report `false`, yanking the
  // card away mid-read.
  const [showFirstDecidedCelebration, setShowFirstDecidedCelebration] =
    useState(false);
  useEffect(() => {
    if (data?.viewer.firstDecidedCelebration) {
      setShowFirstDecidedCelebration(true);
    }
  }, [data]);

  // Seed the ballot from the server once, then leave the voter's own order
  // alone so a realtime refresh cannot yank options out from under someone
  // mid-drag. That "leave it alone" used to mean the ranking widget never
  // looked at `data.event.options` again after the first touch — so an
  // option someone else added mid-vote showed up in the raw options list
  // (which reads live data directly) but never in "Your ranking," and
  // could never actually be ranked (CHANGES_20260804.md §3). Once touched,
  // this still doesn't reset the voter's order, but it does merge in any
  // option id it hasn't seen yet, appended at the end, unranked.
  useEffect(() => {
    if (!data) return;
    if (!ballotTouched) {
      setBallot(
        data.viewer.myVote.length > 0
          ? data.viewer.myVote
          : data.event.options.map((o) => o.place_id)
      );
      return;
    }
    setBallot((prev) => {
      const known = new Set(prev);
      const arrived = data.event.options
        .map((o) => o.place_id)
        .filter((id) => !known.has(id));
      return arrived.length > 0 ? [...prev, ...arrived] : prev;
    });
  }, [data, ballotTouched]);

  const { data: placesData } = useSWR<{ places: Place[] }>(
    data?.viewer.canAddOptions ||
      (data?.viewer.isHost && data?.event.status === "closed")
      ? "/api/places"
      : null,
    fetcher
  );

  if (isLoading) return <SkeletonDetail />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return null;

  const { event, viewer } = data;
  const isOpen = event.status === "open";
  const isCancelled = event.status === "cancelled";
  const isDatePolling = event.date_phase === "polling";
  const isClosed = event.status === "closed";
  const canReopen =
    isClosed && new Date(event.scheduled_at).getTime() > Date.now();
  const isUpcoming = new Date(event.scheduled_at).getTime() > Date.now();

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

  // Optimistic: voting/ranking and RSVP are the two highest-traffic buttons
  // on this page, and `run()`'s plain await-then-revalidate meant every tap
  // waited out the full client → Vercel → Supabase → back round trip before
  // anything visibly changed (CHANGES_20260804.md §5). Both update `viewer`
  // instantly and let the real fetch settle in the background; SWR rolls
  // back on its own if the request fails. The Borda tally itself is left to
  // the real revalidation rather than predicted client-side — it depends on
  // every other voter's ballots (and is redacted entirely for a hidden-vote
  // Jio), so a guessed number would either be wrong or leak what §14 hides.
  const submitBallot = () => {
    if (!data) return;
    setActionError(null);
    setBusy(true);
    mutate(
      mutateJson(`/api/events/${id}/vote`, "POST", {
        ranked_place_ids: ballot,
      }).then(() => fetcher<EventResponse>(`/api/events/${id}`)),
      {
        optimisticData: { ...data, viewer: { ...data.viewer, myVote: ballot } },
        rollbackOnError: true,
        revalidate: false,
      }
    )
      .catch((err) =>
        setActionError(err instanceof Error ? err.message : "Something failed")
      )
      .finally(() => setBusy(false));
  };

  const sendRsvp = (response: RsvpResponse) => {
    if (!data) return;
    setActionError(null);
    setBusy(true);
    const delta =
      (data.viewer.myRsvp === "yes" ? -1 : 0) + (response === "yes" ? 1 : 0);
    mutate(
      mutateJson(`/api/events/${id}/rsvp`, "POST", { response }).then(() =>
        fetcher<EventResponse>(`/api/events/${id}`)
      ),
      {
        optimisticData: {
          ...data,
          event: {
            ...data.event,
            going_count: Math.max(0, (data.event.going_count ?? 0) + delta),
          },
          viewer: { ...data.viewer, myRsvp: response },
        },
        rollbackOnError: true,
        revalidate: false,
      }
    )
      .catch((err) =>
        setActionError(err instanceof Error ? err.message : "Something failed")
      )
      .finally(() => setBusy(false));
  };

  const addOption = (placeId: string) =>
    run(async () => {
      await mutateJson(`/api/events/${id}/options`, "POST", {
        place_id: placeId,
      });
      setAddQuery("");
      setBallotTouched(false);
      setPendingPoolPrompt(null);
    });

  // "Not here? Add it anyway" — logs a vote option with no place record yet.
  // Skipped for the host in the pool-prompt step below: a host adding an
  // option already leans toward intending it as a real place, per the 1 Aug
  // candidate-refinement note, so only guests get asked afterward.
  const addFreeTextOption = (label: string) =>
    run(async () => {
      const result = await mutateJson<{
        option: { place_id: string; label: string };
      }>(`/api/events/${id}/options`, "POST", { label });
      setAddQuery("");
      setBallotTouched(false);
      if (!data?.viewer.isHost) {
        setPendingPoolPrompt({
          placeId: result.option.place_id,
          label: result.option.label,
        });
      }
    });

  const removeOption = (placeId: string) =>
    run(async () => {
      await mutateJson(
        `/api/events/${id}/options?placeId=${placeId}`,
        "DELETE"
      );
      setBallotTouched(false);
    });

  const sendInvites = () =>
    run(async () => {
      await mutateJson(`/api/events/${id}/invitees`, "POST", {
        user_ids: inviteSelection.userIds,
        kaki_ids: inviteSelection.kakiIds,
      });
      setInviting(false);
      setInviteSelection({ userIds: [], kakiIds: [] });
    });

  const removeInvitee = (userId: string) =>
    run(async () => {
      await mutateJson(
        `/api/events/${id}/invitees?userId=${userId}`,
        "DELETE"
      );
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

  // CHANGES_20260819c.md §1 — reschedule, host-only, any time short of
  // cancelled. Typing a date/time directly finalizes a still-polling Flexi
  // Jio the same way confirming a candidate does (handled server-side).
  const reschedule = () =>
    run(async () => {
      if (!rescheduleValue) return;
      await mutateJson(`/api/events/${id}`, "PATCH", {
        scheduled_at: new Date(`${rescheduleValue}+08:00`).toISOString(),
      });
      setReschedulingOpen(false);
      setRescheduleValue("");
    });

  // CHANGES_20260819c.md §2 — "where did you actually go?", host-only,
  // closed Jios only. Deliberately small scope: only this Jio's own record.
  const editWinner = (placeId: string) =>
    run(async () => {
      await mutateJson(`/api/events/${id}`, "PATCH", {
        winner_place_id: placeId,
      });
      setEditingWinner(false);
      setWinnerQuery("");
    });

  const cancelJio = () => {
    if (
      !window.confirm(
        "Cancel this Jio? Everyone invited will see it marked cancelled — this can't be undone."
      )
    ) {
      return;
    }
    run(() => mutateJson(`/api/events/${id}/cancel`, "POST"));
  };

  // Undoes a close. Existing ballots are left as-is — see reopenEvent's
  // doc comment in src/lib/data/index.ts.
  const reopenVoting = () => {
    if (
      !window.confirm(
        "Reopen this Jio for voting? Everyone will be able to vote again, and the current winner is cleared until it's closed once more."
      )
    ) {
      return;
    }
    run(() => mutateJson(`/api/events/${id}/reopen`, "POST"));
  };

  // CHANGES_20260821c.md §1 — a per-Jio override on top of the "You"-page
  // default. `null` clears it back to "use my default."
  const setReminderLead = (leadMinutes: number | null) =>
    run(async () => {
      await mutateJson(`/api/events/${id}/reminder`, "PUT", {
        lead_minutes: leadMinutes,
      });
      setEditingReminder(false);
    });

  const optionPlaces = event.options
    .map((o) => o.place)
    .filter((p): p is Place => Boolean(p));

  const tally = event.tally ?? {};
  const maxPoints = Math.max(1, ...Object.values(tally));
  const voterCount =
    event.voter_count ?? new Set(event.votes.map((v) => v.user_id)).size;

  // CHANGES_20260819c.md §3 — the share card's top-3 breakdown, from the
  // same tally + options the in-app Standing list above already uses.
  // Filtering to `points > 0` is what makes a Jio closed with no votes at
  // all naturally end up with an empty array (the card omits its chart
  // entirely rather than showing a zero-point bar).
  const shareStandings = event.options
    .map((o) => ({
      name: o.place?.name ?? o.label ?? "Unknown place",
      points: tally[o.place_id] ?? 0,
      isWinner: event.winner_place_id === o.place_id,
    }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  // §14 — hidden only while open; once closed this is the first time
  // anyone sees the result, same "DECIDED" moment as any other Jio.
  const hideStanding = isOpen && Boolean(event.hide_votes);

  const orderedBallot = ballot.filter((placeId) =>
    event.options.some((o) => o.place_id === placeId)
  );

  const addCandidates = (placesData?.places ?? [])
    .filter((p) => !event.options.some((o) => o.place_id === p.id))
    .filter((p) =>
      addQuery ? p.name.toLowerCase().includes(addQuery.toLowerCase()) : false
    )
    .slice(0, 6);

  // CHANGES_20260819c.md §2 — not restricted to `event.options`, since the
  // whole point is correcting to wherever the group actually ended up.
  const winnerCandidates = (placesData?.places ?? [])
    .filter((p) => p.id !== event.winner_place_id)
    .filter((p) =>
      winnerQuery
        ? p.name.toLowerCase().includes(winnerQuery.toLowerCase())
        : false
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
          <Chip className={isOpen ? "" : isCancelled ? "text-stone" : "bg-line"}>
            {isDatePolling
              ? "Picking a date"
              : isOpen
                ? "Open"
                : isCancelled
                  ? "Cancelled"
                  : "Closed"}
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

      {!isOpen && !isCancelled && showFirstDecidedCelebration && (
        <Card className="border-ember/40 bg-ember-tint/70 animate-fade-in space-y-1 text-center">
          <p className="text-2xl" aria-hidden="true">
            🎉
          </p>
          <p className="font-display text-ink text-lg font-bold tracking-tight">
            Your first decided Jio!
          </p>
          <p className="text-stone text-sm">
            You voted, the group decided — this is how it goes from here.
          </p>
        </Card>
      )}

      {!isOpen && isCancelled && (
        <Card className="border-line bg-cream/60">
          <p className="text-sm">
            Cancelled by {event.host_name ?? "the host"}.
          </p>
        </Card>
      )}

      {!isOpen && !isCancelled && (
        <Card
          className={cn(
            "border-sage/40 bg-sage-tint/70",
            justResolved &&
              (event.winner_place_name || event.winner_label) &&
              "animate-resolved"
          )}
        >
          {event.winner_place_name || event.winner_label ? (
            <div className="flex items-center gap-3">
              <CheckCircle2
                className="text-sage h-8 w-8 shrink-0"
                strokeWidth={2}
                aria-hidden="true"
              />
              <div>
                <p className="text-sage text-xs font-semibold tracking-wide uppercase">
                  Decided
                </p>
                <p className="font-display text-ink text-xl font-bold tracking-tight">
                  {event.winner_place_name ?? event.winner_label}
                </p>
                {/* A free-text option won with no places row behind it —
                    there's nothing to link to, so this is skipped rather
                    than shown broken. */}
                {!event.winner_place_name && event.winner_label && (
                  <p className="text-stone mt-0.5 text-xs">
                    Not in the places list yet.
                  </p>
                )}
                {event.winner_place_name && event.winner_place_id && (
                  <p className="mt-1 flex gap-3 text-xs">
                    <Link
                      href={`/places/${event.winner_place_id}`}
                      className="text-ember underline"
                    >
                      View place
                    </Link>
                    {event.winner_place && (
                      <a
                        href={googleMapsPlaceUrl(event.winner_place)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ember underline"
                      >
                        View on Google Maps
                      </a>
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm">
              Closed without a winner — nobody voted in time.
            </p>
          )}
        </Card>
      )}

      {!isOpen &&
        !isCancelled &&
        (event.winner_place_name || event.winner_label) && (
          <ShareResultCard
            title={event.title}
            placeName={event.winner_place_name ?? event.winner_label ?? ""}
            whenLabel={formatDateTime(event.scheduled_at)}
            standings={shareStandings}
            mapsUrl={
              event.winner_place
                ? googleMapsPlaceUrl(event.winner_place)
                : undefined
            }
          />
        )}

      {/*
        Available as soon as the date is fixed, not once the whole Jio is
        decided — same gate `canAddToCalendar` uses. People want to block
        their own calendar without waiting on the group to finish voting or
        RSVPing. A one-time snapshot either way: neither link updates if
        this Jio's time or place changes after someone adds it.
      */}
      {canAddToCalendar(event) && (
        <div className="border-line bg-cream flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <p className="text-ink text-sm font-medium">Add to calendar</p>
          <LinkButton
            href={googleCalendarUrl({
              id: event.id,
              title: event.title,
              scheduledAt: event.scheduled_at,
              location:
                event.winner_place_name ?? event.winner_label ?? "Place TBD",
              description: [
                event.host_name && `Hosted by ${event.host_name}`,
                `View this Jio: ${eventInviteUrl(event.invite_token)}`,
              ]
                .filter(Boolean)
                .join("\n"),
              url: eventInviteUrl(event.invite_token),
            })}
            variant="secondary"
            size="sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Calendar
          </LinkButton>
          <a
            href={`/api/events/${event.id}/ics`}
            className="text-ember text-xs underline"
          >
            Download .ics
          </a>
        </div>
      )}

      {/*
        CHANGES_20260821c.md §1 — confirmed-going only (RSVP "yes"), same
        gate the API enforces server-side. Not a Flexi Jio date question —
        this is about the lunch itself starting soon, so it's fine for a
        decided Jio too, not just open ones.
      */}
      {!isCancelled && isUpcoming && viewer.myRsvp === "yes" && viewer.reminder && (
        <div className="border-line bg-cream space-y-2 rounded-xl border p-3">
          <p className="text-ink text-sm font-medium">Reminder</p>
          {!viewer.reminder.enabled ? (
            <p className="text-stone text-xs">
              Reminders are off.{" "}
              <Link href="/profile" className="text-ember underline">
                Turn them on under You
              </Link>{" "}
              to get a heads-up before this Jio starts.
            </p>
          ) : editingReminder ? (
            <div className="flex flex-wrap items-center gap-2">
              {LEAD_TIME_OPTIONS.map((minutes) => (
                <Button
                  key={minutes}
                  size="sm"
                  variant={
                    viewer.reminder?.overrideLeadMinutes === minutes
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() => setReminderLead(minutes)}
                  disabled={busy}
                >
                  {leadTimeLabel(minutes)}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReminderLead(null)}
                disabled={busy || viewer.reminder.overrideLeadMinutes === null}
              >
                Use my default
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingReminder(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-stone text-xs">
                We&apos;ll remind you{" "}
                {leadTimeLabel(
                  viewer.reminder.overrideLeadMinutes ??
                    viewer.reminder.defaultLeadMinutes
                )}{" "}
                before
                {viewer.reminder.overrideLeadMinutes === null
                  ? " (your default)"
                  : " (just for this Jio)"}
                .
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingReminder(true)}
              >
                Change for this Jio
              </Button>
            </div>
          )}
        </div>
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

      {/*
        --- RSVP ---
        Answerable, and who answered what stays visible, regardless of
        open/closed — CHANGES_20260819b.md: "esp once confirmed everyone
        should be able to see who's going and who can't make it," which the
        old version got backwards (the whole card vanished the moment a Jio
        closed). The buttons themselves used to close along with it too,
        which quietly broke the companion feature right above this one — a
        host can invite someone new after the Jio's already decided, but
        they had no way to actually say "I'm in" once it was. Only
        `cancelled` (nothing left to RSVP to) and Flexi date-polling
        (no fixed date yet to be "coming" to) hide this card outright.
      */}
      {!isDatePolling && !isCancelled && (
        <Card>
          <SectionHeading>Who's coming</SectionHeading>

          <div className="mb-3 flex gap-2">
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

          {event.rsvps.length > 0 ? (
            <div className="space-y-2.5">
              {(["yes", "maybe", "no"] as RsvpResponse[]).map((response) => {
                const people = event.rsvps.filter(
                  (r) => r.response === response
                );
                if (people.length === 0) return null;
                const label =
                  response === "yes"
                    ? "Going"
                    : response === "maybe"
                      ? "Maybe"
                      : "Can't make it";
                return (
                  <div key={response}>
                    <p className="text-stone text-xs font-medium tracking-wide uppercase">
                      {label} · {people.length}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {people.map((rsvp) => (
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
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-stone text-xs">Nobody has responded yet.</p>
          )}
        </Card>
      )}

      {/*
        --- Manage invitees --- (host only)
        CHANGES_20260819b.md — "host can add or remove users in the Jio,
        both before and after confirmed." No `isOpen`/`isCancelled` gate on
        purpose: the backend allows either action at any status, and a host
        closing (or even cancelling) a Jio doesn't stop being able to say
        who's on it.
      */}
      {viewer.isHost && (
        <Card className="space-y-3">
          <SectionHeading>Invited</SectionHeading>

          {event.kaki_id && (
            <p className="text-stone text-xs">
              This Jio is also linked to a Kaki group — its members can see
              and join it too, and aren&apos;t listed (or removable) here.
            </p>
          )}

          {event.invitees.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {event.invitees.map((invitee) => (
                <button
                  key={invitee.user_id}
                  type="button"
                  onClick={() => removeInvitee(invitee.user_id)}
                  disabled={busy}
                  className="border-line text-stone rounded-full border px-2.5 py-1 text-xs hover:border-ember hover:text-ember"
                >
                  {invitee.display_name ?? "Teammate"} ×
                </button>
              ))}
            </div>
          ) : (
            <p className="text-stone text-xs">
              Nobody individually invited yet.
            </p>
          )}

          {inviting ? (
            <div className="space-y-2">
              <InvitePicker
                value={inviteSelection}
                onChange={setInviteSelection}
                selfId={viewer.id}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={sendInvites}
                  disabled={
                    busy ||
                    (inviteSelection.userIds.length === 0 &&
                      inviteSelection.kakiIds.length === 0)
                  }
                >
                  Send invites
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setInviting(false);
                    setInviteSelection({ userIds: [], kakiIds: [] });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setInviting(true)}
            >
              Invite more people
            </Button>
          )}
        </Card>
      )}

      {/* --- Standing --- */}
      {!isDatePolling && (
      <Card>
        <SectionHeading>
          {isOpen ? "Standing" : isCancelled ? "Standing when cancelled" : "Final count"}
        </SectionHeading>
        <p className="text-stone mb-3 text-xs">
          {voterCount === 0
            ? "Nobody has voted yet."
            : hideStanding
              ? `${voterCount} ballot${voterCount === 1 ? "" : "s"} in. Standing stays hidden until this Jio closes.`
              : `${voterCount} ballot${voterCount === 1 ? "" : "s"} in. Points come from everyone's rankings, not just first choices.`}
        </p>

        {hideStanding && (
          <p className="bg-paper text-stone mb-3 rounded-lg px-3 py-2 text-xs">
            🔒 Votes hidden until this Jio closes
          </p>
        )}

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
                    {option.place ? (
                      <Link
                        href={`/places/${option.place.id}`}
                        className="hover:underline"
                      >
                        {option.place.name}
                      </Link>
                    ) : (
                      (option.label ?? "Unknown place")
                    )}
                    {isWinner && " ✓"}
                    {option.is_suggested && (
                      <span className="bg-ember/15 text-ember ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                        Suggested
                      </span>
                    )}
                    {option.place && (
                      <a
                        href={googleMapsPlaceUrl(option.place)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${option.place.name} on Google Maps`}
                        className="text-stone hover:text-ember ml-1.5 inline-block align-middle"
                      >
                        <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                      </a>
                    )}
                    {option.place?.socials_url && (
                      <a
                        href={option.place.socials_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={socialsLabel(option.place.socials_url)}
                        className="text-stone hover:text-ember ml-1.5 inline-block align-middle"
                      >
                        <SocialsIcon
                          url={option.place.socials_url}
                          className="h-3.5 w-3.5"
                        />
                      </a>
                    )}
                    {/*
                      CHANGES_20260819d.md §1 — a free-text option (no
                      `place` behind it) gets the same slot's opposite
                      affordance: a permanent way for *any* viewer, not just
                      whoever typed it in, to register it as a real place.
                      The one-time `pendingPoolPrompt` nudge below is
                      unaffected — this is additive, for anyone looking at
                      the Standing later rather than only the adder in that
                      one moment. Same /places/new flow either way.
                      Scoped to `isOpen`, per the doc.
                    */}
                    {!option.place && isOpen && (
                      <Link
                        href={`/places/new?name=${encodeURIComponent(option.label ?? "")}&fromEvent=${id}&draftPlaceId=${encodeURIComponent(option.place_id)}`}
                        aria-label={`Add "${option.label ?? "this"}" to Places`}
                        title="Add to Places"
                        className="text-stone hover:text-ember ml-1.5 inline-block align-middle"
                      >
                        <CirclePlus className="h-3.5 w-3.5" strokeWidth={2} />
                      </Link>
                    )}
                  </span>
                  {!hideStanding && (
                    <span className="text-stone shrink-0 text-xs tabular-nums">
                      {points} pt{points === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {!hideStanding && (
                  <div className="bg-paper mt-1 h-2 overflow-hidden rounded-full">
                    <div
                      className={
                        isWinner ? "bg-sage h-full" : "bg-ember h-full"
                      }
                      style={{ width: `${(points / maxPoints) * 100}%` }}
                    />
                  </div>
                )}
                {option.place && placeDescriptor(option.place) && (
                  <p className="text-stone mt-0.5 text-[11px]">
                    {placeDescriptor(option.place)}
                  </p>
                )}
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
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm">
                      {option?.place ? (
                        <Link
                          href={`/places/${option.place.id}`}
                          className="truncate hover:underline"
                        >
                          {option.place.name}
                        </Link>
                      ) : (
                        <span className="truncate">
                          {option?.label ?? "Unknown"}
                        </span>
                      )}
                      {option?.place && (
                        <a
                          href={googleMapsPlaceUrl(option.place)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${option.place.name} on Google Maps`}
                          className="text-stone hover:text-ember shrink-0"
                        >
                          <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                        </a>
                      )}
                      {option?.place?.socials_url && (
                        <a
                          href={option.place.socials_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={socialsLabel(option.place.socials_url)}
                          className="text-stone hover:text-ember shrink-0"
                        >
                          <SocialsIcon
                            url={option.place.socials_url}
                            className="h-3.5 w-3.5"
                          />
                        </a>
                      )}
                    </span>
                    {option?.place && placeDescriptor(option.place) && (
                      <span className="text-stone block truncate text-[11px]">
                        {placeDescriptor(option.place)}
                      </span>
                    )}
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

          {/* Nothing matched — "vote first, prompt after" (§8). Logs the
              option immediately so the person doesn't have to become a
              data-entry clerk mid-vote just to register "I want McDonald's." */}
          {addCandidates.length === 0 && addQuery.trim().length > 0 && (
            <div className="border-line mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
              <p className="text-stone min-w-0 truncate text-sm">
                Not here? Add &ldquo;{addQuery.trim()}&rdquo; anyway
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addFreeTextOption(addQuery.trim())}
                disabled={busy}
              >
                Add
              </Button>
            </div>
          )}

          {pendingPoolPrompt && (
            <div className="border-line bg-paper mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <p className="text-stone text-xs">
                &ldquo;{pendingPoolPrompt.label}&rdquo; is on the ballot. Add
                it to the pool so it&apos;s findable next time?
              </p>
              <span className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPendingPoolPrompt(null)}
                >
                  Not now
                </Button>
                <LinkButton
                  className="min-h-0 px-3 py-1.5 text-xs"
                  href={`/places/new?name=${encodeURIComponent(pendingPoolPrompt.label)}&fromEvent=${id}&draftPlaceId=${encodeURIComponent(pendingPoolPrompt.placeId)}`}
                >
                  Add to pool
                </LinkButton>
              </span>
            </div>
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
                      {option.place?.name ?? option.label} ×
                    </button>
                  ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/*
        --- Edit this Jio --- (host only)
        CHANGES_20260819c.md §1/§2 — corrections a host can make after the
        fact: the date/time (any time short of cancelled — even after
        closed, since a lunch's actual time can slip after it's decided),
        and once closed, which place it actually ended up at. Deliberately
        separate from "Close it" below: these are corrections to a Jio
        that's already settled one way or another, not part of settling it.
      */}
      {viewer.isHost && !isCancelled && (
        <Card className="space-y-3">
          <SectionHeading>Edit this Jio</SectionHeading>

          {reschedulingOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={rescheduleValue}
                onChange={(e) => setRescheduleValue(e.target.value)}
                className={inputClass}
              />
              <Button
                size="sm"
                onClick={reschedule}
                disabled={busy || !rescheduleValue}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReschedulingOpen(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRescheduleValue(
                  `${sgtDateKey(event.scheduled_at)}T${sgtTimeOfDay(event.scheduled_at)}`
                );
                setReschedulingOpen(true);
              }}
            >
              Change date &amp; time
            </Button>
          )}

          {!isOpen && (
            <div className="border-line space-y-2 border-t pt-3">
              <p className="text-stone text-xs">Where did you actually go?</p>
              {editingWinner ? (
                <div className="space-y-2">
                  <input
                    value={winnerQuery}
                    onChange={(e) => setWinnerQuery(e.target.value)}
                    className={inputClass}
                    placeholder="Search places…"
                  />
                  {winnerCandidates.length > 0 && (
                    <ul className="space-y-1">
                      {winnerCandidates.map((place) => (
                        <li key={place.id}>
                          <button
                            type="button"
                            onClick={() => editWinner(place.id)}
                            disabled={busy}
                            className="hover:bg-paper flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                          >
                            <span className="truncate">{place.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingWinner(false);
                      setWinnerQuery("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditingWinner(true)}
                >
                  Correct the winner
                </Button>
              )}
            </div>
          )}

          {canReopen && (
            <div className="border-line space-y-2 border-t pt-3">
              <p className="text-stone text-xs">
                Change your mind? Put it back to a vote — the current winner
                is cleared until it's closed again, and everyone's existing
                vote still counts unless they change it.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={reopenVoting}
                disabled={busy}
              >
                Reopen for voting
              </Button>
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

      {/* Separate from "Close it" — calling a Jio off is a different,
          larger action than locking in a winner, and reads that way rather
          than sharing a card with it. */}
      {viewer.isHost && isOpen && (
        <Card className="space-y-2">
          <SectionHeading>Cancel this Jio</SectionHeading>
          <p className="text-stone text-xs">
            Stays visible to everyone invited, marked cancelled. This
            can&apos;t be undone.
          </p>
          <Button variant="danger" onClick={cancelJio} disabled={busy}>
            Cancel this Jio
          </Button>
        </Card>
      )}

    </div>
  );
}
