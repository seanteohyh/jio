"use client";

import { useState } from "react";
import useSWR from "swr";
import MapView from "@/components/MapView";
import FilterBar, {
  DEFAULT_FILTERS,
  type FilterState,
} from "@/components/FilterBar";
import PlaceCard from "@/components/PlaceCard";
import { Button, ErrorNote, Skeleton } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import { DEFAULT_OFFICE } from "@/lib/constants";
import type { Office, Place, WalkingRoute } from "@/types";

export default function MapPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Place | null>(null);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [routing, setRouting] = useState(false);

  const query = new URLSearchParams({
    maxWalk: String(filters.maxWalk),
    budgetMax: String(filters.budgetMax),
  });
  if (filters.cuisines.length > 0) {
    query.set("cuisines", filters.cuisines.join(","));
  }
  if (filters.search) query.set("q", filters.search);

  const { data, error, isLoading } = useSWR<{ places: Place[] }>(
    `/api/places?${query.toString()}`,
    fetcher
  );
  const { data: officeData } = useSWR<{ offices: Office[] }>(
    "/api/offices",
    fetcher
  );

  const office = officeData?.offices?.[0] ?? DEFAULT_OFFICE;
  const places = data?.places ?? [];

  const showRoute = async (place: Place) => {
    setSelected(place);
    setRouting(true);
    setRoute(null);

    try {
      const response = await fetch(
        `/api/route?toLat=${place.lat}&toLng=${place.lng}` +
          `&fromLat=${office.lat}&fromLng=${office.lng}`
      );
      const payload: { route: WalkingRoute } = await response.json();
      setRoute(payload.route?.polyline ?? null);
    } catch {
      // A missing route just means no line on the map.
    } finally {
      setRouting(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
        <p className="text-stone mt-1 text-sm">
          Everything within walking distance of {office.name}. Tap a pin for the
          walking route.
        </p>
      </header>

      <FilterBar value={filters} onChange={setFilters} />

      {error && <ErrorNote>{error.message}</ErrorNote>}

      <div className="border-line h-[55vh] min-h-72 overflow-hidden rounded-xl border">
        <MapView
          office={office}
          places={places}
          selectedId={selected?.id ?? null}
          onSelect={showRoute}
          route={route}
        />
      </div>

      {isLoading && <Skeleton className="h-5 w-40" />}

      {selected && (
        <div className="animate-fade-in space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-stone text-xs">
              {routing ? "Working out the walk…" : "Selected"}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(null);
                setRoute(null);
              }}
            >
              Clear
            </Button>
          </div>
          <PlaceCard place={selected} />
        </div>
      )}

      <p className="text-stone text-xs">
        Showing {places.length} place{places.length === 1 ? "" : "s"}. Map data
        © OpenStreetMap contributors.
      </p>
    </div>
  );
}
