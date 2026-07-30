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
  Spinner,
  inputClass,
} from "../ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { DEFAULT_OFFICE } from "@/lib/constants";
import type { Place, ScoredPlace, TeamUser } from "@/types";

interface SuggestResponse {
  suggestions: (ScoredPlace & { why: string })[];
}

interface SearchResponse {
  places: Place[];
}

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
 * Any registered place is fair game, not just places either person has
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

  const [toUserId, setToUserId] = useState("");
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
  const [newLat, setNewLat] = useState(String(DEFAULT_OFFICE.lat));
  const [newLng, setNewLng] = useState(String(DEFAULT_OFFICE.lng));
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: suggestData, isLoading: loadingSuggestions } =
    useSWR<SuggestResponse>(
      toUserId ? `/api/lobangs/suggest?to=${toUserId}` : null,
      fetcher
    );

  const { data: searchData, isLoading: searching } = useSWR<SearchResponse>(
    toUserId && search.trim().length >= 2
      ? `/api/places?status=active&q=${encodeURIComponent(search.trim())}`
      : null,
    fetcher
  );

  const teammates = (usersData?.users ?? []).filter((u) => u.user_id !== selfId);
  const suggestions = suggestData?.suggestions ?? [];
  const searchResults = searchData?.places ?? [];

  const choosePlace = (id: string, name: string) => {
    setPlaceId(id);
    setSelectedPlaceName(name);
  };

  const send = async () => {
    if (!toUserId || !placeId) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/lobangs", "POST", {
        to_user_id: toUserId,
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
    setAddBusy(true);
    setAddError(null);
    try {
      // Same POST /api/places path the standalone "Add a place" form uses —
      // status defaults to active there too, so this gets the same
      // auto-trust as any other manual add. created_by is set server-side
      // from the signed-in user, same as every other entry point.
      const payload = await mutateJson<{ place: Place }>("/api/places", "POST", {
        name: newName.trim(),
        address: newAddress.trim() || null,
        lat: Number(newLat),
        lng: Number(newLng),
        cuisine: [],
        best_dishes: [],
      });
      choosePlace(payload.place.id, payload.place.name);
      setAddingPlace(false);
      setNewName("");
      setNewAddress("");
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
        setNewLat(position.coords.latitude.toFixed(6));
        setNewLng(position.coords.longitude.toFixed(6));
      },
      () => setAddError("Could not get your location — enter it by hand")
    );
  };

  return (
    <Card className="animate-fade-in space-y-3">
      <Field label="Send lobang to">
        <select
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className={inputClass}
        >
          <option value="">Pick a teammate</option>
          {teammates.map((t) => (
            <option key={t.user_id} value={t.user_id}>
              {t.display_name}
            </option>
          ))}
        </select>
      </Field>

      {toUserId && (
        <div className="space-y-3">
          <p className="text-dolch-text text-sm font-medium">Place</p>

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

          {loadingSuggestions && <Spinner label="Finding places" />}

          {!loadingSuggestions && suggestions.length > 0 && (
            <div>
              <p className="text-dolch-muted mb-1.5 text-xs font-medium">
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
                            ? "border-dolch-accent bg-dolch-accent/10"
                            : "border-dolch-border bg-dolch-surface/60 hover:border-dolch-accent/40")
                        }
                      >
                        <span className="min-w-0 truncate font-medium">
                          {s.place.name}
                        </span>
                        <span className="text-dolch-muted shrink-0 text-xs">
                          {s.why}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-dolch-muted mb-1.5 text-xs font-medium">
              Or search
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputClass}
              placeholder="Search every registered place…"
            />

            {searching && <Spinner label="Searching" />}

            {!searching && search.trim().length >= 2 && (
              <ul className="mt-1.5 space-y-1.5">
                {searchResults.length === 0 && (
                  <li className="text-dolch-muted text-xs">
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
                          ? "border-dolch-accent bg-dolch-accent/10"
                          : "border-dolch-border bg-dolch-surface/60 hover:border-dolch-accent/40")
                      }
                    >
                      <span className="min-w-0 truncate font-medium">
                        {p.name}
                      </span>
                      {p.address && (
                        <span className="text-dolch-muted shrink-0 truncate text-xs">
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
            <p className="text-dolch-muted text-xs">
              Selected: <span className="text-dolch-text font-medium">{selectedPlaceName}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => setAddingPlace((v) => !v)}
            className="text-dolch-accent text-xs underline"
          >
            {addingPlace ? "Never mind" : "Can't find it? Add it here"}
          </button>

          {addingPlace && (
            <Card className="bg-dolch-bg space-y-3">
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
                <Field label="Address" hint="Optional, but it helps people find it.">
                  <input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude">
                    <input
                      required
                      value={newLat}
                      onChange={(e) => setNewLat(e.target.value)}
                      className={inputClass}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      required
                      value={newLng}
                      onChange={(e) => setNewLng(e.target.value)}
                      className={inputClass}
                      inputMode="decimal"
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={useMyLocation}
                >
                  Use my current location
                </Button>

                {addError && <ErrorNote>{addError}</ErrorNote>}

                <Button
                  type="submit"
                  size="sm"
                  disabled={addBusy || !newName.trim()}
                >
                  {addBusy ? "Adding…" : "Add & select"}
                </Button>
                <p className="text-dolch-muted text-xs">
                  Cuisine, budget and dishes can be filled in later from the
                  place's own page.
                </p>
              </form>
            </Card>
          )}
        </div>
      )}

      {toUserId && (
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
          disabled={busy || !toUserId || !placeId}
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
            className="text-dolch-accent ml-auto text-xs underline"
          >
            View place
          </Link>
        )}
      </div>
    </Card>
  );
}
