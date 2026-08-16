"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  SkeletonRows,
  inputClass,
} from "../ui";
import ShareLink from "../ShareLink";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { Kaki, Lobang, Place, ScoredPlace, TeamUser } from "@/types";

interface SuggestResponse {
  suggestions: (ScoredPlace & { why: string })[];
}

interface SearchResponse {
  places: Place[];
}

type RecipientMode = "users" | "kaki" | "public";

interface SendLobangPanelProps {
  selfId: string;
  eventId?: string;
  defaultPlaceId?: string | null;
  defaultPlaceName?: string | null;
  /** `wasPublic` is true only after the "Anyone (get a link)" path
   *  actually finished (the "Done" button, not the moment the link is
   *  generated — that click is the visitor's cue they're finished copying
   *  or sharing it, not the panel's). */
  onSent: (wasPublic?: boolean) => void;
  onCancel: () => void;
}

/**
 * The "Share this lobang" composer — CHANGES_20260816.md §4 widened this
 * from "send lobang" to a third path, "Anyone (get a link)", alongside
 * teammates and a whole Kaki.
 *
 * Recipients are a multi-select of specific teammates, a single Kaki you're
 * a member of (every current member gets it, minus yourself), or nobody in
 * particular — a public link anyone can open, signed in or not, resolved
 * later through `/l/[token]`. The three modes aren't combinable in one
 * send. Any registered place is fair game, not just places either person
 * has actually been to — a lobang is often "saw this online, thought of
 * you." The originating Jio's winner is pinned at the top, personalized
 * "quick picks" sit just below it as a shortcut (teammates/Kaki modes
 * only — there's no one specific person to personalize a public link for),
 * and a real search box covers everything else. If the place genuinely
 * isn't registered yet, "Can't find it? Add it here" opens a minimal
 * add-place form inline, so composing a lobang never means losing your
 * note and recipient to a trip to /places/new and back.
 *
 * "Anyone (get a link)" is the one mode without a picker: it's a
 * single-purpose "share this exact place," always the one this panel was
 * opened from, so it skips the chip/search/add-place block entirely rather
 * than asking the sender to reconfirm what they're already looking at.
 */
export default function SendLobangPanel({
  selfId,
  eventId,
  defaultPlaceId,
  defaultPlaceName,
  onSent,
  onCancel,
}: SendLobangPanelProps) {
  const { data: usersData } = useSWR<{ users: TeamUser[] }>(
    "/api/users",
    fetcher
  );
  const { data: kakisData } = useSWR<{ kakis: Kaki[] }>("/api/kakis", fetcher);

  const [mode, setMode] = useState<RecipientMode>("users");
  const [toUserIds, setToUserIds] = useState<string[]>([]);
  const [kakiId, setKakiId] = useState("");
  const [placeId, setPlaceId] = useState(defaultPlaceId ?? "");
  const [selectedPlaceName, setSelectedPlaceName] = useState(
    defaultPlaceName ?? ""
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [addingPlace, setAddingPlace] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCoords, setNewCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [newLocatedVia, setNewLocatedVia] = useState<"geocoded" | "gps" | null>(
    null
  );
  const [addBusy, setAddBusy] = useState(false);
  const [geocodingNew, setGeocodingNew] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const teammates = (usersData?.users ?? []).filter((u) => u.user_id !== selfId);
  const kakis = kakisData?.kakis ?? [];
  // "public" needs no recipient selection at all — picking that mode is
  // itself the whole choice, so the place picker below opens immediately.
  const hasRecipient =
    mode === "users"
      ? toUserIds.length > 0
      : mode === "kaki"
        ? Boolean(kakiId)
        : true;
  // Personalized "quick picks" only make sense against one specific person.
  const singleUserId =
    mode === "users" && toUserIds.length === 1 ? toUserIds[0] : undefined;

  const { data: suggestData, isLoading: loadingSuggestions } =
    useSWR<SuggestResponse>(
      singleUserId ? `/api/lobangs/suggest?to=${singleUserId}` : null,
      fetcher
    );

  const { data: searchData, isLoading: searching } = useSWR<SearchResponse>(
    hasRecipient && search.trim().length >= 2
      ? `/api/places?status=active&q=${encodeURIComponent(search.trim())}`
      : null,
    fetcher
  );

  const suggestions = suggestData?.suggestions ?? [];
  const searchResults = searchData?.places ?? [];

  const toggleUser = (userId: string) => {
    setToUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const switchMode = (next: RecipientMode) => {
    setMode(next);
    setToUserIds([]);
    setKakiId("");
    setPublicUrl(null);
    // A public link is a single-purpose "share this exact place," not a
    // recommendation composer — always the place this panel was opened
    // from, never something to search for a substitute for.
    if (next === "public" && defaultPlaceId) {
      setPlaceId(defaultPlaceId);
      setSelectedPlaceName(defaultPlaceName ?? "");
    }
  };

  const choosePlace = (id: string, name: string) => {
    setPlaceId(id);
    setSelectedPlaceName(name);
  };

  const send = async () => {
    if (!hasRecipient || !placeId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await mutateJson<{ lobang: Lobang; url?: string }>(
        "/api/lobangs",
        "POST",
        {
          to_user_ids: mode === "users" ? toUserIds : undefined,
          kaki_id: mode === "kaki" ? kakiId : undefined,
          public: mode === "public" ? true : undefined,
          place_id: placeId,
          note: note.trim() || undefined,
          event_id: eventId ?? null,
        }
      );
      // Public mode isn't "done" the moment the link exists — it needs to
      // actually be copied or shared, so this shows the link instead of
      // closing the panel; teammates/Kaki modes still close immediately,
      // unchanged from before this path existed.
      if (mode === "public" && result.url) {
        setPublicUrl(result.url);
      } else {
        onSent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that");
    } finally {
      setBusy(false);
    }
  };

  const addPlace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setAddError(null);

    let resolved = newCoords;

    if (!resolved) {
      if (!newAddress.trim()) {
        setAddError("Enter an address or postal code so we can place it on the map");
        return;
      }
      setGeocodingNew(true);
      try {
        const { result, message } = await fetcher<{
          result: { lat: number; lng: number; address: string } | null;
          message?: string;
        }>(`/api/geocode?q=${encodeURIComponent(newAddress.trim())}`);
        if (!result) {
          setAddError(message ?? "Couldn't find that address");
          setGeocodingNew(false);
          return;
        }
        resolved = { lat: result.lat, lng: result.lng };
        setNewCoords(resolved);
        setNewLocatedVia("geocoded");
      } catch (err) {
        setAddError(
          err instanceof Error ? err.message : "Could not look up that address"
        );
        setGeocodingNew(false);
        return;
      }
      setGeocodingNew(false);
    }

    setAddBusy(true);
    try {
      // Same POST /api/places path the standalone "Add a place" form uses —
      // status defaults to active there too, so this gets the same
      // auto-trust as any other manual add. created_by is set server-side
      // from the signed-in user, same as every other entry point.
      const payload = await mutateJson<{ place: Place }>("/api/places", "POST", {
        name: newName.trim(),
        address: newAddress.trim() || null,
        lat: resolved.lat,
        lng: resolved.lng,
        cuisine: [],
        best_dishes: [],
      });
      choosePlace(payload.place.id, payload.place.name);
      setAddingPlace(false);
      setNewName("");
      setNewAddress("");
      setNewCoords(null);
      setNewLocatedVia(null);
      setSearch("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add that place");
    } finally {
      setAddBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setAddError("This browser will not share a location");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setNewLocatedVia("gps");
        setAddError(null);
      },
      () => setAddError("Could not get your location — try the address field instead")
    );
  };

  // The public path isn't "done" until the link is actually copied or
  // shared — so once it exists, this replaces the whole composer with
  // just the result, rather than closing the panel out from under it.
  if (publicUrl) {
    return (
      <Card className="animate-fade-in space-y-3">
        <p className="text-sm">
          Link ready for{" "}
          <span className="font-medium">
            {selectedPlaceName || "this place"}
          </span>
          .
        </p>
        <ShareLink
          url={publicUrl}
          label="Share this lobang"
          shareText={`Check out ${selectedPlaceName || "this place"} — via Jio`}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onSent(true)}>
            Done
          </Button>
          {placeId && (
            <Link
              href={`/places/${placeId}`}
              className="text-ember ml-auto text-xs underline"
            >
              View place
            </Link>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in space-y-3">
      <Field label="Send lobang to">
        {/*
          Tabs, not Chips — the mode picker and the actual multi-select
          list right below it were both rendering as identical rounded
          pills, which read as one long list of equally-weighted options
          rather than "pick a mode, then pick from within it." An
          underline style borrowed from nowhere else in this file on
          purpose: it only needs to look unmistakably different from the
          Chip rows above and below it, not match an existing pattern.
        */}
        <div className="border-line flex flex-wrap gap-4 border-b">
          <button
            type="button"
            onClick={() => switchMode("users")}
            className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors ${
              mode === "users"
                ? "border-ember text-ink"
                : "text-stone hover:text-ink border-transparent"
            }`}
          >
            Teammates
          </button>
          {kakis.length > 0 && (
            <button
              type="button"
              onClick={() => switchMode("kaki")}
              className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors ${
                mode === "kaki"
                  ? "border-ember text-ink"
                  : "text-stone hover:text-ink border-transparent"
              }`}
            >
              A whole Kaki
            </button>
          )}
          <button
            type="button"
            onClick={() => switchMode("public")}
            className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors ${
              mode === "public"
                ? "border-ember text-ink"
                : "text-stone hover:text-ink border-transparent"
            }`}
          >
            Anyone (get a link)
          </button>
        </div>

        {mode === "users" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {teammates.map((t) => (
              <Chip
                key={t.user_id}
                active={toUserIds.includes(t.user_id)}
                onClick={() => toggleUser(t.user_id)}
              >
                {t.display_name}
              </Chip>
            ))}
          </div>
        )}

        {mode === "kaki" && (
          <select
            value={kakiId}
            onChange={(e) => setKakiId(e.target.value)}
            className={`${inputClass} mt-2`}
          >
            <option value="">Pick a Kaki</option>
            {kakis.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} · {k.member_count ?? "?"} members
              </option>
            ))}
          </select>
        )}

        {mode === "public" && (
          <p className="text-stone mt-2 text-xs">
            Anyone with the link can open it — not just people already on
            Jio. It won&apos;t appear in your Lobangs feed or send a push.
          </p>
        )}
      </Field>

      {hasRecipient && mode === "public" && defaultPlaceId && (
        <p className="text-sm">
          Sharing{" "}
          <span className="font-medium">
            {selectedPlaceName || defaultPlaceName || "this place"}
          </span>
          .
        </p>
      )}

      {hasRecipient && !(mode === "public" && defaultPlaceId) && (
        <div className="space-y-3">
          <p className="text-ink text-sm font-medium">Place</p>

          {defaultPlaceId && (
            <Chip
              active={placeId === defaultPlaceId}
              onClick={() =>
                choosePlace(defaultPlaceId, defaultPlaceName ?? "This Jio's pick")
              }
            >
              {defaultPlaceName ?? "This Jio's pick"} · from this Jio
            </Chip>
          )}

          {loadingSuggestions && <SkeletonRows count={2} rowClassName="h-14 w-full" />}

          {!loadingSuggestions && suggestions.length > 0 && (
            <div>
              <p className="text-stone mb-1.5 text-xs font-medium">
                Quick picks
              </p>
              <ul className="space-y-1.5">
                {suggestions
                  .filter((s) => s.place.id !== defaultPlaceId)
                  .slice(0, 5)
                  .map((s) => (
                    <li key={s.place.id}>
                      <button
                        type="button"
                        onClick={() => choosePlace(s.place.id, s.place.name)}
                        className={
                          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                          (placeId === s.place.id
                            ? "border-ember bg-ember/10"
                            : "border-line bg-cream/60 hover:border-ember/40")
                        }
                      >
                        <span className="min-w-0 truncate font-medium">
                          {s.place.name}
                        </span>
                        <span className="text-stone shrink-0 text-xs">
                          {s.why}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-stone mb-1.5 text-xs font-medium">
              Or search
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputClass}
              placeholder="Search every registered place…"
            />

            {searching && <SkeletonRows count={2} rowClassName="h-14 w-full" />}

            {!searching && search.trim().length >= 2 && (
              <ul className="mt-1.5 space-y-1.5">
                {searchResults.length === 0 && (
                  <li className="text-stone text-xs">
                    No matches. Not registered yet? Add it below.
                  </li>
                )}
                {searchResults.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choosePlace(p.id, p.name)}
                      className={
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                        (placeId === p.id
                          ? "border-ember bg-ember/10"
                          : "border-line bg-cream/60 hover:border-ember/40")
                      }
                    >
                      <span className="min-w-0 truncate font-medium">
                        {p.name}
                      </span>
                      {p.address && (
                        <span className="text-stone shrink-0 truncate text-xs">
                          {p.address}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {placeId && selectedPlaceName && (
            <p className="text-stone text-xs">
              Selected: <span className="text-ink font-medium">{selectedPlaceName}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => setAddingPlace((v) => !v)}
            className="text-ember text-xs underline"
          >
            {addingPlace ? "Never mind" : "Can't find it? Add it here"}
          </button>

          {addingPlace && (
            <Card className="bg-paper space-y-3">
              <form onSubmit={addPlace} className="space-y-3">
                <Field label="Name">
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={inputClass}
                    placeholder="Where you saw it"
                    autoFocus
                  />
                </Field>
                <Field
                  label="Address or postal code"
                  hint="We'll look up the coordinates — no need to know them."
                >
                  <input
                    required={!newCoords}
                    value={newAddress}
                    onChange={(e) => {
                      setNewAddress(e.target.value);
                      if (newLocatedVia === "gps") {
                        setNewCoords(null);
                        setNewLocatedVia(null);
                      }
                    }}
                    className={inputClass}
                    placeholder="466 Crawford Ln, or just 190466"
                  />
                </Field>

                {newLocatedVia === "gps" && (
                  <p className="text-sage text-xs">
                    Using your current location ✓
                  </p>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={useMyLocation}
                >
                  Use my current location instead
                </Button>

                {addError && <ErrorNote>{addError}</ErrorNote>}

                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    addBusy ||
                    geocodingNew ||
                    !newName.trim() ||
                    (!newCoords && !newAddress.trim())
                  }
                >
                  {geocodingNew
                    ? "Looking up address…"
                    : addBusy
                      ? "Adding…"
                      : "Add & select"}
                </Button>
                <p className="text-stone text-xs">
                  Cuisine, budget and dishes can be filled in later from the
                  place's own page.
                </p>
              </form>
            </Card>
          )}
        </div>
      )}

      <Field label="Note (optional)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
          rows={2}
          maxLength={280}
          placeholder="Why you're thinking of them for this one"
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex items-center gap-2">
        <Button
          onClick={send}
          disabled={busy || !hasRecipient || !placeId}
          size="sm"
        >
          {mode === "public"
            ? busy
              ? "Getting link…"
              : "Get link"
            : busy
              ? "Sending…"
              : "Send lobang"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {placeId && (
          <Link
            href={`/places/${placeId}`}
            className="text-ember ml-auto text-xs underline"
          >
            View place
          </Link>
        )}
      </div>
    </Card>
  );
}
