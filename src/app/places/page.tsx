"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import PlaceCard from "@/components/PlaceCard";
import FilterBar, {
  DEFAULT_FILTERS,
  type FilterState,
} from "@/components/FilterBar";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  LinkButton,
  SectionHeading,
  Spinner,
} from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { Place } from "@/types";

const PAGE_SIZE = 15;

export default function PlacesPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<Place[]>([]);

  const baseQuery = new URLSearchParams({
    maxWalk: String(filters.maxWalk),
    budgetMax: String(filters.budgetMax),
    status: "active",
  });
  if (filters.cuisines.length > 0) {
    baseQuery.set("cuisines", filters.cuisines.join(","));
  }
  if (filters.search) baseQuery.set("q", filters.search);
  const filterKey = baseQuery.toString();

  // A filter change starts the list over at page 1.
  useEffect(() => {
    setPage(1);
    setLoaded([]);
  }, [filterKey]);

  const pageQuery = new URLSearchParams(baseQuery);
  pageQuery.set("page", String(page));
  pageQuery.set("limit", String(PAGE_SIZE));

  const { data, error, isLoading } = useSWR<{ places: Place[]; total: number }>(
    `/api/places?${pageQuery.toString()}`,
    fetcher
  );

  // Each page's results append to what's already shown, keyed by id so a
  // refetch of a page already on screen (e.g. after adding a place) can't
  // duplicate rows.
  useEffect(() => {
    if (!data) return;
    setLoaded((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const additions = data.places.filter((p) => !seen.has(p.id));
      return page === 1 ? data.places : [...prev, ...additions];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // The review queue: places the discovery cron found that nobody has vetted.
  const { data: pendingData } = useSWR<{ places: Place[] }>(
    features.discovery ? "/api/places?status=needs_review" : null,
    fetcher
  );

  const places = loaded;
  const total = data?.total ?? places.length;
  const hasMore = places.length < total;
  const pending = pendingData?.places ?? [];

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Places</h1>
          <p className="text-dolch-muted mt-1 text-sm">
            Everywhere the team knows about.
          </p>
        </div>
        <LinkButton href="/places/new">Add</LinkButton>
      </header>

      <FilterBar value={filters} onChange={setFilters} />

      {pending.length > 0 && (
        <Card className="border-dolch-warn/30 bg-amber-50/50">
          <SectionHeading>
            {pending.length} place{pending.length === 1 ? "" : "s"} to review
          </SectionHeading>
          <p className="text-dolch-muted mb-3 text-xs">
            Found automatically from OpenStreetMap. Nothing here shows up in
            suggestions until someone confirms it is real.
          </p>
          <ul className="space-y-2">
            {pending.slice(0, 5).map((place) => (
              <li key={place.id}>
                <PlaceCard
                  place={place}
                  compact
                  action={
                    <Link
                      href={`/places/${place.id}`}
                      className="text-dolch-accent shrink-0 text-xs underline"
                    >
                      Review
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {features.blogImport && (
        <p className="text-dolch-muted text-xs">
          Read a good list somewhere?{" "}
          <Link href="/places/import" className="text-dolch-accent underline">
            Import from a blog post
          </Link>
          .
        </p>
      )}

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && page === 1 && <Spinner label="Loading places" />}

      {!isLoading && places.length === 0 && !error && (
        <EmptyState
          title="Nothing here yet"
          description="Either the filters are too tight, or nobody has added anywhere yet."
          action={<LinkButton href="/places/new">Add the first place</LinkButton>}
        />
      )}

      {places.length > 0 && (
        <>
          <p className="text-dolch-muted text-xs">
            {places.length} of {total} place{total === 1 ? "" : "s"}, nearest
            first
          </p>
          <ul className="space-y-2">
            {places.map((place) => (
              <li key={place.id}>
                <PlaceCard place={place} />
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center pt-1">
              {isLoading && page > 1 ? (
                <Spinner label="Loading more" />
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Load more
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
