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
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { Kaki, Place, ScoredPlace, TeamUser } from "@/types";

interface SuggestResponse {
  suggestions: (ScoredPlace & { why: string })[];
}

interface SearchResponse {
  places: Place[];
}

type RecipientMode = "users" | "kaki";

interface SendLobangPanelProps {
  selfId: string;
  eventId?: string;
  defaultPlaceId?: string | null;
  defaultPlaceName?: string | null;
  onSent: () => void;
  onCancel: () => void;
}

/**
 * The "send lobang" composer.
 *
 * Recipients are either a multi-select of specific teammates, or a single
 * Kaki you're a member of (every current member gets it, minus yourself) —
 * the two modes aren't combinable in one send, to keep duplicate-handling
 * unambiguous. Any registered place is fair game, not just places either
 * person has
 * actually been to — a lobang is often "saw this online, thought of you."
 * The originating Jio's winner is pinned at the top, personalized "quick
 * picks" sit just below it as a shortcut, and a real search box covers
 * everything else. If the place genuinely isn't registered yet, "Can't find
 * it? Add it here" opens a minimal add-place form inline, so composing a
 * lobang never means losing your note and recipient to a trip to
 * /places/new and back.
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
  const hasRecipient =
    mode === "users" ? toUserIds.length > 0 : Boolean(kakiId);
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
      await mutateJson("/api/lobangs", "POST", {
        to_user_ids: mode === "users" ? toUserIds : undefined,
        kaki_id: mode === "kaki" ? kakiId : undefined,
        place_id: placeId,
        note: note.trim() || undefined,
        event_id: eventId ?? null,
      });
      onSent();
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

  return (
    <Card className="animate-fade-in space-y-3">
      <Field label="Send lobang to">
        <div className="flex gap-2">
          <Chip active={mode === "users"} onClick={() => switchMode("users")}>
            Teammates
          </Chip>
          {kakis.length > 0 && (
            <Chip active={mode === "kaki"} onClick={() => switchMode("kaki")}>
              A whole Kaki
            </Chip>
          )}
        </div>

        {mode === "users" ? (
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
        ) : (
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
      </Field>

      {hasRecipient && (
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

      {hasRecipient && (
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
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex items-center gap-2">
        <Button
          onClick={send}
          disabled={busy || !hasRecipient || !placeId}
          size="sm"
        >
          {busy ? "Sending…" : "Send lobang"}
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
