"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  inputClass,
} from "@/components/ui";
import { BUDGET_TIERS, CUISINES } from "@/lib/constants";
import { formatCuisine } from "@/lib/utils";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { BudgetTier, Place } from "@/types";

/**
 * Add or correct a place. One form, two modes.
 *
 * Editing deliberately reuses the create form rather than getting a cut-down
 * editor of its own: if a field can be set when adding a place, it can be
 * fixed later. That is the whole point of letting anyone edit.
 *
 * What is *not* here is as deliberate. `status` moves only through
 * /block, /unblock and /review, each with its own authorization rule, and a
 * column-level grant stops a plain update touching it at all. The derived
 * columns — walk_minutes, avg_rating, visit_count, has_pending_flag — are
 * computed, and rendering them in a form invites someone to try editing them.
 */
export default function PlaceForm({
  place,
  onSaved,
  initialName,
}: {
  /** Omit to create. Provide to edit that place. */
  place?: Place;
  onSaved?: (id: string) => void;
  /** Pre-fills the name when arriving from the blog importer. */
  initialName?: string;
}) {
  const router = useRouter();
  const editing = Boolean(place);

  const [name, setName] = useState(place?.name ?? initialName ?? "");
  const initialAddress = place?.address ?? "";
  const [address, setAddress] = useState(initialAddress);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    place ? { lat: place.lat, lng: place.lng } : null
  );
  const [locatedVia, setLocatedVia] = useState<"geocoded" | "gps" | null>(null);
  const [cuisine, setCuisine] = useState<string[]>(place?.cuisine ?? []);
  const [customCuisineTags, setCustomCuisineTags] = useState<string[]>(
    place?.custom_cuisine_tags ?? []
  );
  const [otherInputOpen, setOtherInputOpen] = useState(false);
  const [otherInput, setOtherInput] = useState("");
  const [budget, setBudget] = useState<BudgetTier>(place?.budget_tier ?? 2);
  const [dishes, setDishes] = useState((place?.best_dishes ?? []).join(", "));
  const [notes, setNotes] = useState(place?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCuisine = (value: string) =>
    setCuisine((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );

  const addCustomCuisineTag = () => {
    const trimmed = otherInput.trim();
    if (!trimmed) return;
    setCustomCuisineTags((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed]
    );
    setOtherInput("");
  };

  const removeCustomCuisineTag = (value: string) =>
    setCustomCuisineTags((prev) => prev.filter((c) => c !== value));

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("This browser will not share a location");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocatedVia("gps");
        setError(null);
      },
      () =>
        setError("Could not get your location — try the address field instead")
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    let resolved = coords;

    // Only geocode when there is nothing pinned yet. GPS and an existing
    // place's stored coordinates both count as pinned — an address typed over
    // the top of them clears `coords` in the onChange below, which is what
    // forces a fresh lookup.
    if (!resolved) {
      if (!address.trim()) {
        setError(
          "Enter an address or postal code so we can place it on the map"
        );
        return;
      }
      setGeocoding(true);
      try {
        const { result, message } = await fetcher<{
          result: { lat: number; lng: number; address: string } | null;
          message?: string;
        }>(`/api/geocode?q=${encodeURIComponent(address.trim())}`);
        if (!result) {
          setError(message ?? "Couldn't find that address");
          setGeocoding(false);
          return;
        }
        resolved = { lat: result.lat, lng: result.lng };
        setCoords(resolved);
        setLocatedVia("geocoded");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not look up that address"
        );
        setGeocoding(false);
        return;
      }
      setGeocoding(false);
    }

    const body = {
      name: name.trim(),
      address: address.trim() || null,
      lat: resolved.lat,
      lng: resolved.lng,
      cuisine,
      custom_cuisine_tags: customCuisineTags,
      budget_tier: budget,
      best_dishes: dishes
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      notes: notes.trim() || null,
    };

    setBusy(true);
    try {
      const payload = await mutateJson<{ place: { id: string } }>(
        editing ? `/api/places/${place!.id}` : "/api/places",
        editing ? "PUT" : "POST",
        body
      );

      const id = payload.place.id;
      if (onSaved) onSaved(id);
      else router.push(`/places/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  };

  const addressChanged = editing && address.trim() !== initialAddress.trim();

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Hill Street Tai Hwa Pork Noodle"
            autoFocus={!editing}
          />
        </Field>

        <Field
          label="Address or postal code"
          hint="We'll look up the coordinates for you — no need to know them."
        >
          <input
            required={!coords}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              // A hand-typed address supersedes whatever was pinned before,
              // whether that was a GPS fix or the place's stored coordinates.
              setCoords(null);
              setLocatedVia(null);
            }}
            className={inputClass}
            placeholder="466 Crawford Ln, Singapore 190466, or just 190466"
          />
        </Field>

        {locatedVia === "gps" && (
          <p className="text-sage text-xs">
            Using your current location ✓
          </p>
        )}

        {addressChanged && !coords && (
          <p className="text-stone text-xs">
            The address changed, so the coordinates will be looked up again on
            save. Its walking time gets recalculated after that.
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
        <p className="text-stone text-xs">
          Standing outside the place? That button skips the address lookup and
          uses exactly where you are.
        </p>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-ink mb-2 text-sm font-medium">Cuisine</p>
          <div className="flex flex-wrap gap-1.5">
            {CUISINES.map((c) => (
              <Chip
                key={c}
                active={cuisine.includes(c)}
                onClick={() => toggleCuisine(c)}
              >
                {formatCuisine(c)}
              </Chip>
            ))}
            <Chip
              active={otherInputOpen}
              onClick={() => setOtherInputOpen((prev) => !prev)}
            >
              Other
            </Chip>
          </div>

          {otherInputOpen && (
            <div className="mt-2 flex gap-1.5">
              <input
                value={otherInput}
                onChange={(e) => setOtherInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomCuisineTag();
                  }
                }}
                className={inputClass}
                placeholder="e.g. Peranakan"
              />
              <Button type="button" variant="secondary" size="sm" onClick={addCustomCuisineTag}>
                Add
              </Button>
            </div>
          )}

          {customCuisineTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customCuisineTags.map((tag) => (
                <Chip key={tag} active onClick={() => removeCustomCuisineTag(tag)}>
                  {tag} ×
                </Chip>
              ))}
            </div>
          )}
          <p className="text-stone mt-1 text-xs">
            Custom tags show on the place but don&apos;t affect recommendations.
          </p>
        </div>

        <div>
          <p className="text-ink mb-2 text-sm font-medium">
            Roughly how much
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BUDGET_TIERS.map((tier) => (
              <Chip
                key={tier.tier}
                active={budget === tier.tier}
                onClick={() => setBudget(tier.tier)}
              >
                {tier.label} · {tier.description}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="Best dishes" hint="Comma separated.">
          <input
            value={dishes}
            onChange={(e) => setDishes(e.target.value)}
            className={inputClass}
            placeholder="Bak chor mee, dumplings"
          />
        </Field>

        <Field label="Notes" hint="Queue times, closing days, anything useful.">
          <textarea
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} min-h-20`}
            placeholder="Closed Mondays. Queue is worst 12:15–12:45."
          />
        </Field>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            busy || geocoding || !name.trim() || (!coords && !address.trim())
          }
        >
          {geocoding
            ? "Looking up address…"
            : busy
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Save place"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
