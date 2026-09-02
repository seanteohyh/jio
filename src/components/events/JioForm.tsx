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
import AreaPicker, { type AreaSelection } from "@/components/events/AreaPicker";
import HintCard from "@/components/HintCard";
import { useToast } from "@/components/Toast";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { features } from "@/lib/config";
import { BUDGET_TIERS } from "@/lib/constants";
import type { BudgetTier, Place, ScoredPlace } from "@/types";

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
  const showToast = useToast();

  const [mode, setMode] = useState<Mode>("fixed");
  const [title, setTitle] = useState(initialTitle ?? "Lunch");
  const [when, setWhen] = useState(defaultDateTime());
  const [candidateDates, setCandidateDates] = useState<string[]>([]);
  const [newCandidateDate, setNewCandidateDate] = useState("");
  // One shared time for whichever candidate date ends up confirmed — a
  // Flexi Jio polls the *date*, not the time. Previously missing entirely:
  // a confirmed date was stored as a bare "YYYY-MM-DD", which always parses
  // as UTC midnight — 8am once shown in Singapore time.
  const [flexiTime, setFlexiTime] = useState("12:00");
  const [selected, setSelected] = useState<string[]>(initialPlaceIds ?? []);
  const [invite, setInvite] = useState<InviteSelection>(
    initialInvite ?? { userIds: [], kakiIds: [] }
  );
  const [placeQuery, setPlaceQuery] = useState("");
  // Suggest Area Filter spec §2 — per-Jio × per-request, never persisted:
  // just another input feeding the same suggestQuery/useSWR fetch below,
  // exactly like the group/personal switch already does.
  const [area, setArea] = useState<AreaSelection | null>(null);
  // 6 (the top tier) is a true no-op default — nothing is tiered above it —
  // same "Up to" convention as the Places page's own budget filter.
  const [budgetMax, setBudgetMax] = useState<BudgetTier>(6);
  const [newOnly, setNewOnly] = useState(false);
  const [hideVotes, setHideVotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UX review log #6 — group-aware scoring, single-Kaki-group case only:
  // the invite list can mix individual people and multiple Kaki groups, but
  // the group-scoring endpoint only understands one `kakiId`. Anything
  // mixed or ad-hoc-only falls back to today's personal-taste suggestions.
  const groupScoped =
    features.kakis && invite.kakiIds.length === 1 && invite.userIds.length === 0;
  const areaParams = area ? `&areaLat=${area.lat}&areaLng=${area.lng}` : "";
  const filterParams =
    (budgetMax !== 6 ? `&budgetMax=${budgetMax}` : "") +
    (newOnly ? `&excludeVisited=true` : "");
  const suggestQuery = groupScoped
    ? `/api/suggest?mode=group&kakiId=${invite.kakiIds[0]}&limit=15${areaParams}${filterParams}`
    : `/api/suggest?limit=15${areaParams}${filterParams}`;
  const { data: suggestData } = useSWR<{ suggestions: ScoredPlace[] }>(
    suggestQuery,
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
   * What the option list shows, clustered into labelled groups (UX review
   * log #6) rather than one flat row — so it's clear *why* a place is
   * showing up (suggested for you/the group, a search match, or already
   * picked) instead of everything reading as one undifferentiated pool.
   *
   * Searching replaces the suggestions rather than filtering them — the
   * whole point of the box is reaching places the recommender did not
   * surface. Anything already selected but not otherwise in view gets its
   * own small group, so a search (or the group/personal suggestion switch)
   * can never make a chosen option disappear from sight.
   */
  const optionGroups: { label: string; places: Place[] }[] = useMemo(() => {
    const isSearching = trimmedQuery.length >= 2;
    const base = isSearching ? (searchData?.places ?? []) : suggested;
    const pinned = suggested.filter(
      (p) => selected.includes(p.id) && !base.some((b) => b.id === p.id)
    );

    const groups: { label: string; places: Place[] }[] = [];
    if (base.length > 0) {
      groups.push({
        label: isSearching
          ? "Search results"
          : groupScoped
            ? "Suggested for the group"
            : "Suggested for you",
        places: base,
      });
    }
    if (pinned.length > 0) {
      groups.push({ label: "Already selected", places: pinned });
    }
    return groups;
  }, [trimmedQuery, searchData, suggested, selected, groupScoped]);

  const optionPool: Place[] = useMemo(
    () => optionGroups.flatMap((g) => g.places),
    [optionGroups]
  );

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
          ? {
              ...shared,
              candidate_dates: candidateDates,
              time_of_day: flexiTime,
            }
          : {
              ...shared,
              scheduled_at: new Date(when).toISOString(),
              place_ids: selected,
            }
      );
      showToast("Jio started");
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
    <>
      <HintCard page="start-jio" icon="🗳️">
        Everyone ranks the options — the Borda count just means points for
        where you rank something, so it&apos;s rarely just
        first-choice-wins.
      </HintCard>

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
                // A native datetime-local input can ignore `width: 100%` and
                // size itself to its own content instead (a WebKit quirk),
                // pushing past its card's padding on iOS. `min-w-0` forces
                // it to actually respect the container like every other
                // input does.
                className={`${inputClass} min-w-0`}
              />
            </Field>
          ) : (
            <>
              <Field
                label="Candidate dates"
                hint="At least 2. Everyone marks which ones they're free, then you confirm one."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newCandidateDate}
                    onChange={(e) => setNewCandidateDate(e.target.value)}
                    className={`${inputClass} min-w-0`}
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
                        aria-label={`Remove ${date}`}
                        className="border-line text-stone rounded-full border px-2.5 py-3.5 text-xs hover:border-ember hover:text-ember"
                      >
                        {date} <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field
                label="Time"
                hint="Same time whichever date gets confirmed."
              >
                <input
                  type="time"
                  value={flexiTime}
                  onChange={(e) => setFlexiTime(e.target.value)}
                  className={`${inputClass} min-w-0`}
                />
              </Field>
            </>
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

            <div className="flex items-center gap-2">
              <span className="text-stone text-xs">Suggestions near</span>
              <AreaPicker value={area} onChange={setArea} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs">
                <span className="text-stone">Up to</span>
                <select
                  value={budgetMax}
                  onChange={(e) =>
                    setBudgetMax(Number(e.target.value) as BudgetTier)
                  }
                  className="border-line bg-paper rounded-lg border px-2 py-1 text-xs"
                  aria-label="Maximum budget for suggestions"
                >
                  {BUDGET_TIERS.map((tier) => (
                    <option key={tier.tier} value={tier.tier}>
                      {tier.label} ({tier.description})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setNewOnly((v) => !v)}
                aria-pressed={newOnly}
                className={
                  newOnly
                    ? "bg-ember rounded-full px-2.5 py-1 text-xs font-medium text-white"
                    : "border-line text-stone hover:border-ember hover:text-ember rounded-full border px-2.5 py-1 text-xs"
                }
              >
                New to you only
              </button>
            </div>

            {trimmedQuery.length >= 2 && searching && (
              <p className="text-stone text-xs">Searching…</p>
            )}

            {optionPool.length === 0 && !searching && (
              <p className="text-stone text-xs">
                {trimmedQuery.length >= 2 ? "Nothing found." : "Loading…"}
              </p>
            )}

            {/* UX review log #6 — clustered into labelled groups (suggested
                for you/the group, search results, already selected) rather
                than one flat row, so it's clear why each place is showing
                up. */}
            {optionGroups.map((group) => (
              <div key={group.label}>
                <p className="text-stone text-xs">
                  {group.label}
                  {group.label === "Search results" &&
                    ` — ${group.places.length} match${group.places.length === 1 ? "" : "es"}`}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.places.map((place) => {
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
              </div>
            ))}

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
    </>
  );
}
