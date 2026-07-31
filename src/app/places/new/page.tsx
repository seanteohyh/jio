"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Spinner,
  inputClass,
} from "@/components/ui";
import { BUDGET_TIERS, CUISINES } from "@/lib/constants";
import { formatCuisine } from "@/lib/utils";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { BudgetTier } from "@/types";

function NewPlaceForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Pre-filled when arriving from the blog importer.
  const [name, setName] = useState(params.get("name") ?? "");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatedVia, setLocatedVia] = useState<"geocoded" | "gps" | null>(null);
  const [cuisine, setCuisine] = useState<string[]>([]);
  const [budget, setBudget] = useState<BudgetTier>(2);
  const [dishes, setDishes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCuisine = (value: string) => {
    setCuisine((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

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
      () => setError("Could not get your location — try the address field instead")
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    let resolved = coords;

    // Only geocode if GPS hasn't already pinned it — otherwise the address
    // text is just a label, not the source of truth for the coordinates.
    if (!resolved) {
      if (!address.trim()) {
        setError("Enter an address or postal code so we can place it on the map");
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
        setError(err instanceof Error ? err.message : "Could not look up that address");
        setGeocoding(false);
        return;
      }
      setGeocoding(false);
    }

    setBusy(true);
    try {
      const payload = await mutateJson<{ place: { id: string } }>(
        "/api/places",
        "POST",
        {
          name: name.trim(),
          address: address.trim() || null,
          lat: resolved.lat,
          lng: resolved.lng,
          cuisine,
          budget_tier: budget,
          best_dishes: dishes
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean),
          notes: notes.trim() || null,
        }
      );

      router.push(`/places/${payload.place.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add a place</h1>
        <p className="text-dolch-muted mt-1 text-sm">
          Everything except the name and location can be filled in later.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Hill Street Tai Hwa Pork Noodle"
              autoFocus
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
                // A hand-typed address supersedes a previous GPS fix.
                if (locatedVia === "gps") {
                  setCoords(null);
                  setLocatedVia(null);
                }
              }}
              className={inputClass}
              placeholder="466 Crawford Ln, Singapore 190466, or just 190466"
            />
          </Field>

          {locatedVia === "gps" && (
            <p className="text-dolch-success text-xs">
              Using your current location ✓
            </p>
          )}

          <Button type="button" variant="secondary" size="sm" onClick={useMyLocation}>
            Use my current location instead
          </Button>
          <p className="text-dolch-muted text-xs">
            Standing outside the place? That button skips the address lookup
            and uses exactly where you are.
          </p>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-dolch-text mb-2 text-sm font-medium">Cuisine</p>
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
            </div>
          </div>

          <div>
            <p className="text-dolch-text mb-2 text-sm font-medium">
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
              value={notes}
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
            {geocoding ? "Looking up address…" : busy ? "Saving…" : "Save place"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewPlacePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewPlaceForm />
    </Suspense>
  );
}
