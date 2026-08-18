"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  SectionHeading,
  inputClass,
} from "@/components/ui";
import InvitePicker, {
  type InviteSelection,
} from "@/components/InvitePicker";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { Place, ScoredPlace } from "@/types";

function defaultDateTime(): string {
  // Noon today, or noon tomorrow if that has already gone past.
  const when = new Date();
  when.setSeconds(0, 0);
  if (when.getHours() >= 13) when.setDate(when.getDate() + 1);
  when.setHours(12, 0, 0, 0);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(
    when.getDate()
  )}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

type Mode = "fixed" | "flexi";

/**
 * The one create-a-Jio form.
 *
 * Previously there were two: the full page at /events/new, and a cut-down
 * three-field wizard on the home screen. They drifted — the home one never
 * gained a date field, invitees or place search — and the difference read as a
 * bug rather than a shortcut. Now both surfaces render this, so parity is
 * structural rather than something to remember.
 *
 * `variant` only changes chrome: "page" owns the heading and a Cancel that
 * goes back, "inline" sits inside the home card and hands cancelling to its
 * parent.
 */
export default function JioForm({
  variant = "page",
  onCancel,
  initialTitle,
  initialPlaceIds,
  initialInvite,
}: {
  variant?: "page" | "inline";
  onCancel?: () => void;
  /** "Same as last time?" — one-tap repeat, prefilled from a past Jio. */
  initialTitle?: string;
  initialPlaceIds?: string[];
  initialInvite?: InviteSelection;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("fixed");
  const [title, setTitle] = useState(initialTitle ?? "Lunch");
  const [when, setWhen] = useState(defaultDateTime());
  const [candidateDates, setCandidateDates] = useState<string[]>([]);
  const [newCandidateDate, setNewCandidateDate] = useState("");
  const [selected, setSelected] = useState<string[]>(initialPlaceIds ?? []);
  const [invite, setInvite] = useState<InviteSelection>(
    initialInvite ?? { userIds: [], kakiIds: [] }
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [hideVotes, setHideVotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suggestData } = useSWR<{ suggestions: ScoredPlace[] }>(
    "/api/suggest?limit=15",
    fetcher
  );

  // Only hit the places endpoint once there is something to search for —
  // otherwise every open of the form pulls the whole list for nothing.
  const trimmedQuery = placeQuery.trim();
  const { data: searchData, isLoading: searching } = useSWR<{
    places: Place[];
  }>(
    trimmedQuery.length >= 2
      ? `/api/places?q=${encodeURIComponent(trimmedQuery)}`
      : null,
    fetcher
  );

  const suggested: Place[] = useMemo(
    () => suggestData?.suggestions.map((s) => s.place) ?? [],
    [suggestData]
  );

  /**
   * What the option list shows. Searching replaces the suggestions rather than
   * filtering them — the whole point of the box is reaching places the
   * recommender did not surface.
   *
   * Anything already selected is pinned on so a search can never make a
   * chosen option disappear from view.
   */
  const optionPool: Place[] = useMemo(() => {
    const base = trimmedQuery.length >= 2 ? (searchData?.places ?? []) : suggested;
    const pinned = suggested.filter(
      (p) => selected.includes(p.id) && !base.some((b) => b.id === p.id)
    );
    return [...base, ...pinned];
  }, [trimmedQuery, searchData, suggested, selected]);

  const addCandidateDate = () => {
    if (!newCandidateDate || candidateDates.includes(newCandidateDate)) return;
    setCandidateDates((prev) => [...prev, newCandidateDate].sort());
    setNewCandidateDate("");
  };

  const toggleOption = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const shared = {
      title: title.trim() || "Lunch",
      hide_votes: hideVotes,
      invitee_ids: invite.userIds,
      // Both, deliberately: the server snapshots every group's members into
      // individual invitees, and keeps the first group as display provenance
      // ("Jio with the lunch kakis"). Same shape migration 019 settled on for
      // lobangs.
      kaki_ids: invite.kakiIds,
      kaki_id: invite.kakiIds[0] ?? null,
    };

    try {
      const payload = await mutateJson<{ event: { id: string } }>(
        "/api/events",
        "POST",
        mode === "flexi"
          ? { ...shared, candidate_dates: candidateDates }
          : {
              ...shared,
              scheduled_at: new Date(when).toISOString(),
              place_ids: selected,
            }
      );
      router.push(`/events/${payload.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create it");
      setBusy(false);
    }
  };

  const Wrapper = variant === "page" ? Card : "div";
  const wrapperProps =
    variant === "page" ? { className: "space-y-4" } : { className: "space-y-4" };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Wrapper {...wrapperProps}>
        <Field label="What is it">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Friday team lunch"
          />
        </Field>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("fixed")}
            className={
              mode === "fixed"
                ? "bg-ember rounded-full px-3 py-1.5 text-xs font-medium text-white"
                : "border-line text-stone rounded-full border px-3 py-1.5 text-xs"
            }
          >
            Pick a date now
          </button>
          <button
            type="button"
            onClick={() => setMode("flexi")}
            className={
              mode === "flexi"
                ? "bg-ember rounded-full px-3 py-1.5 text-xs font-medium text-white"
                : "border-line text-stone rounded-full border px-3 py-1.5 text-xs"
            }
          >
            Poll a few dates first
          </button>
        </div>

        {mode === "fixed" ? (
          <Field label="When" hint="Date and time.">
            <input
              type="datetime-local"
              required
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={inputClass}
            />
          </Field>
        ) : (
          <Field
            label="Candidate dates"
            hint="At least 2. Everyone marks which ones they're free, then you confirm one."
          >
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newCandidateDate}
                onChange={(e) => setNewCandidateDate(e.target.value)}
                className={inputClass}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addCandidateDate}
                disabled={!newCandidateDate}
              >
                Add
              </Button>
            </div>
            {candidateDates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidateDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() =>
                      setCandidateDates((prev) =>
                        prev.filter((d) => d !== date)
                      )
                    }
                    className="border-line text-stone rounded-full border px-2.5 py-1 text-xs hover:border-ember hover:text-ember"
                  >
                    {date} ×
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
      </Wrapper>

      {mode === "fixed" && (
        <Wrapper {...wrapperProps}>
          <SectionHeading>Options to vote on</SectionHeading>

          <Field label="Find a place">
            <input
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              className={inputClass}
              placeholder="Search by name…"
              autoComplete="off"
            />
          </Field>

          <p className="text-stone text-xs">
            {trimmedQuery.length >= 2
              ? searching
                ? "Searching…"
                : `${optionPool.length} match${optionPool.length === 1 ? "" : "es"}`
              : "Suggested for you, best first. Invitees can add more once it is open."}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {optionPool.length === 0 && !searching && (
              <span className="text-stone text-xs">
                {trimmedQuery.length >= 2 ? "Nothing found." : "Loading…"}
              </span>
            )}
            {optionPool.map((place) => {
              const active = selected.includes(place.id);
              return (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => toggleOption(place.id)}
                  className={
                    active
                      ? "bg-ember rounded-full px-2.5 py-1 text-xs text-white"
                      : "border-line text-stone hover:border-ember rounded-full border px-2.5 py-1 text-xs"
                  }
                >
                  {place.name}
                  {typeof place.walk_minutes === "number" && (
                    <span className="opacity-70"> · {place.walk_minutes}m</span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-stone text-xs">
            {selected.length} selected.{" "}
            <Link
              href="/places/new"
              className="hover:text-ember underline"
            >
              Not here? Add a place
            </Link>
          </p>
        </Wrapper>
      )}

      <Wrapper {...wrapperProps}>
        <SectionHeading>Who is coming</SectionHeading>
        <InvitePicker value={invite} onChange={setInvite} />
      </Wrapper>

      <Wrapper {...wrapperProps}>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={hideVotes}
            onChange={(e) => setHideVotes(e.target.checked)}
            className="accent-ember mt-0.5"
          />
          <span>
            <span className="text-ink font-medium">Hide votes until this Jio closes</span>
            <span className="text-stone block text-xs">
              Nobody sees the running standing while voting is open — not
              even you. Only the ballot count shows until it closes. Can’t
              be changed once the Jio is started.
            </span>
          </span>
        </label>
      </Wrapper>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            busy ||
            (mode === "fixed"
              ? selected.length === 0
              : candidateDates.length < 2)
          }
        >
          {busy
            ? "Starting…"
            : mode === "flexi"
              ? "Start polling dates"
              : "Start the Jio"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel ?? (() => router.back())}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
