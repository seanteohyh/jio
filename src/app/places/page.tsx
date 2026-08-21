"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import PlaceCard from "@/components/PlaceCard";
import SaveButton from "@/components/SaveButton";
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
  SkeletonRows,
} from "@/components/ui";
import HintCard from "@/components/HintCard";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { Lobang, Place, WishlistEntry } from "@/types";

const PAGE_SIZE = 15;

type Tab = "all" | "saved" | "lobangs";

export default function PlacesPage() {
  const [tab, setTab] = useState<Tab>("all");

  // Saved entries come back with their place joined on, so this tab needs no
  // second request and no pagination — a wishlist is small by nature.
  const { data: wishlistData, isLoading: wishlistLoading } = useSWR<{
    wishlist: WishlistEntry[];
  }>(features.wishlist ? "/api/wishlist" : null, fetcher);

  const savedPlaces = (wishlistData?.wishlist ?? [])
    .map((entry) => entry.place)
    .filter((place): place is Place => Boolean(place));

  // CHANGES_20260819e.md §2 — fetched here (not just inside the tab's own
  // content) so the tab label can show a count without waiting for the
  // viewer to click into it, same as Saved's own count.
  const {
    data: lobangData,
    isLoading: lobangsLoading,
    mutate: mutateLobangs,
  } = useSWR<{
    lobangs: Lobang[];
  }>(features.lobangs ? "/api/lobangs?direction=received" : null, fetcher);
  const receivedLobangs = lobangData?.lobangs ?? [];
  // The tab badge is an "acknowledge me" count, not a running total — Saved's
  // count stays total-forever because a save has no seen/unseen state, but a
  // lobang does, and a number that never goes away even after you've looked
  // stops meaning anything.
  const unseenLobangCount = receivedLobangs.filter((l) => !l.seen_at).length;

  const tabs = [
    ["all", "All"] as [Tab, string],
    ...(features.wishlist
      ? [
          [
            "saved",
            `Saved${savedPlaces.length ? ` (${savedPlaces.length})` : ""}`,
          ] as [Tab, string],
        ]
      : []),
    ...(features.lobangs
      ? [
          [
            "lobangs",
            `Lobangs${unseenLobangCount ? ` (${unseenLobangCount})` : ""}`,
          ] as [Tab, string],
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Places</h1>
          <p className="text-stone mt-1 text-sm">
            Everywhere the team knows about.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {/*
            Suggest lost its bottom-nav slot and lives here instead. It stays a
            separate page rather than a third tab: /places is a paginated list
            sorted by walk time, /suggest is a scored unpaginated ranking, and
            reconciling two different data shapes into one list buys nothing.
          */}
          <LinkButton href="/suggest" variant="secondary">
            Suggest
          </LinkButton>
          <LinkButton href="/places/new">Add</LinkButton>
        </div>
      </header>

      <HintCard page="places" icon="🔖">
        Filter by cuisine, budget, or walk time to narrow things down, and
        bookmark anywhere you want to find again fast.
      </HintCard>

      {tabs.length > 1 && (
        <div className="border-line flex gap-1 rounded-full border p-1 text-sm">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={
                "flex-1 rounded-full px-3 py-1.5 transition-colors " +
                (tab === key
                  ? "bg-ember font-medium text-white"
                  : "text-stone hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "saved" ? (
        <SavedList
          places={savedPlaces}
          loading={wishlistLoading}
          onBrowse={() => setTab("all")}
        />
      ) : tab === "lobangs" ? (
        <LobangsList
          lobangs={receivedLobangs}
          loading={lobangsLoading}
          onBrowse={() => setTab("all")}
          onChanged={() => mutateLobangs()}
        />
      ) : (
        <BrowseList />
      )}
    </div>
  );
}

function SavedList({
  places,
  loading,
  onBrowse,
}: {
  places: Place[];
  loading: boolean;
  onBrowse: () => void;
}) {
  if (loading) return <SkeletonRows count={3} />;

  if (places.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        description="Tap the bookmark on any place to keep it here. Saving also nudges a place up your suggestions."
        action={
          <Button variant="secondary" onClick={onBrowse}>
            Browse places
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {places.map((place) => (
        <li key={place.id}>
          <PlaceCard place={place} action={<SaveButton placeId={place.id} />} />
        </li>
      ))}
    </ul>
  );
}

/**
 * CHANGES_20260819e.md §2 — received lobangs, right where the "where should
 * we eat" decision actually happens rather than buried in "You." Same
 * `PlaceCard` shape every other list here uses, with the sender's note in
 * the existing `why` slot ("recommender's reason"). Sent lobangs stay off
 * this tab entirely — a lobang you sent isn't a place recommended to *you*,
 * so it doesn't belong in this card shape; the line below points at the
 * full sent+received history instead.
 *
 * Viewing this tab marks its unseen lobangs seen, identical to Profile's
 * `LobangInbox` and `/lobangs` itself — "viewing is seeing," no separate
 * mark-as-read control.
 */
function LobangsList({
  lobangs,
  loading,
  onBrowse,
  onChanged,
}: {
  lobangs: Lobang[];
  loading: boolean;
  onBrowse: () => void;
  onChanged: () => void;
}) {
  const marked = useRef(new Set<string>());
  useEffect(() => {
    const unseen = lobangs.filter((l) => !l.seen_at && !marked.current.has(l.id));
    if (unseen.length === 0) return;
    for (const l of unseen) marked.current.add(l.id);
    Promise.all(
      unseen.map((l) =>
        mutateJson(`/api/lobangs/${l.id}`, "PUT").catch(() => {
          marked.current.delete(l.id);
        })
      )
      // Revalidate once, after the whole batch settles, rather than once per
      // item — this is what turns "(2)" back into a plain "Lobangs" on the
      // tab itself without waiting for the viewer to leave and come back.
    ).then(onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobangs]);

  // Not interested in a place a teammate recommended — the same private
  // dismiss `LobangInbox` already offers, just from this side of the app.
  // The sender is never told; this only ever touches the recipient's own
  // copy of the send.
  const remove = async (id: string) => {
    await mutateJson(`/api/lobangs/${id}`, "DELETE").catch(() => {});
    onChanged();
  };

  if (loading) return <SkeletonRows count={3} />;

  if (lobangs.length === 0) {
    return (
      <EmptyState
        title="No lobangs yet"
        description="Tips teammates send you show up here as soon as they land."
        action={
          <Button variant="secondary" onClick={onBrowse}>
            Browse places
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {lobangs
          .filter((l): l is Lobang & { place: NonNullable<Lobang["place"]> } =>
            Boolean(l.place)
          )
          .map((l) => (
            <li key={l.id}>
              <PlaceCard
                place={l.place}
                why={`${l.from_display_name ?? "A teammate"} recommends this${l.note ? `: "${l.note}"` : ""}`}
                action={
                  <span className="flex shrink-0 items-center gap-2">
                    <SaveButton placeId={l.place.id} />
                    <button
                      type="button"
                      onClick={() => remove(l.id)}
                      className="text-stone hover:text-ink text-xs underline"
                    >
                      Not interested
                    </button>
                  </span>
                }
              />
            </li>
          ))}
      </ul>
      <p className="text-stone text-xs">
        Sent lobangs of your own?{" "}
        <Link href="/lobangs" className="text-ember underline">
          See your full history
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * The browse list: filters, walk-time sort, Load More.
 *
 * Kept as its own component so its paging state unmounts with the tab. Sharing
 * it with the saved list would mean a filter change quietly resetting a list
 * that does not use filters.
 */
function BrowseList() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<Place[]>([]);

  const baseQuery = new URLSearchParams({
    maxWalk: String(filters.maxWalk),
    budgetMax: String(filters.budgetMax),
    status: "active",
    sortBy: filters.sortBy,
  });
  if (filters.cuisines.length > 0) {
    baseQuery.set("cuisines", filters.cuisines.join(","));
  }
  if (filters.search) baseQuery.set("q", filters.search);
  if (filters.kakiFavouritesOnly) baseQuery.set("kakiFavouritesOnly", "true");
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
      <FilterBar value={filters} onChange={setFilters} showSort />

      {pending.length > 0 && (
        <Card className="border-amber/40 bg-amber-tint/60">
          <SectionHeading>
            {pending.length} place{pending.length === 1 ? "" : "s"} to review
          </SectionHeading>
          <p className="text-stone mb-3 text-xs">
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
                      className="text-ember shrink-0 text-xs underline"
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
        <p className="text-stone text-xs">
          Read a good list somewhere?{" "}
          <Link href="/places/import" className="text-ember underline">
            Import from a blog post
          </Link>
          .
        </p>
      )}

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && page === 1 && (
        <SkeletonRows count={6} rowClassName="h-20 w-full" />
      )}

      {!isLoading && places.length === 0 && !error && (
        <EmptyState
          title="Nothing here yet"
          description="Either the filters are too tight, or nobody has added anywhere yet."
          action={<LinkButton href="/places/new">Add the first place</LinkButton>}
        />
      )}

      {places.length > 0 && (
        <>
          <p className="text-stone text-xs">
            {places.length} of {total} place{total === 1 ? "" : "s"},{" "}
            {filters.sortBy === "rating"
              ? "highest rated first"
              : filters.sortBy === "kaki_rating"
                ? "rated highly by your Kaki group first"
                : "nearest first"}
          </p>
          <ul className="space-y-2">
            {places.map((place) => (
              <li key={place.id}>
                <PlaceCard
                  place={place}
                  action={<SaveButton placeId={place.id} />}
                />
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center pt-1">
              {isLoading && page > 1 ? (
                <SkeletonRows count={2} rowClassName="h-20 w-full" className="w-full" />
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
