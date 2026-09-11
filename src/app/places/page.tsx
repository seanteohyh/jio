"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import PlaceCard from "@/components/PlaceCard";
import SaveButton from "@/components/SaveButton";
import FavouriteButton from "@/components/FavouriteButton";
import SuggestionRails from "@/components/places/SuggestionRails";
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
import { NoPlacesMotif } from "@/components/brand/motifs";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { FavouriteEntry, Lobang, Place, WishlistEntry } from "@/types";

const PAGE_SIZE = 15;

type Tab = "all" | "want_to_try" | "tried" | "favourites" | "lobangs";

/** Both toggles, everywhere a place card shows an action — a place can be
 *  saved to either list, both, or neither, from wherever it happens to be
 *  seen. */
function SaveActions({ placeId }: { placeId: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <FavouriteButton placeId={placeId} />
      <SaveButton placeId={placeId} />
    </span>
  );
}

export default function PlacesPage() {
  const [tab, setTab] = useState<Tab>("all");

  // Want to try / Favourites entries come back with their place joined on,
  // so neither tab needs a second request or pagination — both are small
  // lists by nature.
  const {
    data: wishlistData,
    isLoading: wishlistLoading,
    mutate: mutateWishlist,
  } = useSWR<{
    wishlist: WishlistEntry[];
  }>(features.wishlist ? "/api/wishlist" : null, fetcher);
  const wantToTryEntries = (wishlistData?.wishlist ?? []).filter(
    (entry): entry is WishlistEntry & { place: Place } => Boolean(entry.place)
  );

  const { data: favouritesData, isLoading: favouritesLoading } = useSWR<{
    favourites: FavouriteEntry[];
  }>(features.favourites ? "/api/favourites" : null, fetcher);
  const favouritePlaces = (favouritesData?.favourites ?? [])
    .map((entry) => entry.place)
    .filter((place): place is Place => Boolean(place));

  // Never user-toggled — a place lands here on its own once you've logged a
  // review for it or actually attended a Jio decided there.
  const { data: triedData, isLoading: triedLoading } = useSWR<{
    places: Place[];
  }>("/api/tried", fetcher);
  const triedPlaces = triedData?.places ?? [];

  // CHANGES_20260819e.md §2 — fetched here (not just inside the tab's own
  // content) so the tab label can show a count without waiting for the
  // viewer to click into it, same as every other tab's own count.
  const {
    data: lobangData,
    isLoading: lobangsLoading,
    mutate: mutateLobangs,
  } = useSWR<{
    lobangs: Lobang[];
  }>(features.lobangs ? "/api/lobangs?direction=received" : null, fetcher);
  const receivedLobangs = lobangData?.lobangs ?? [];
  // The tab badge is an "acknowledge me" count, not a running total — Want
  // to try/Favourites/Tried's counts stay total-forever because none of
  // them have a seen/unseen state, but a lobang does, and a number that
  // never goes away even after you've looked stops meaning anything.
  const unseenLobangCount = receivedLobangs.filter((l) => !l.seen_at).length;

  const tabs = [
    ["all", "All"] as [Tab, string],
    ...(features.wishlist
      ? [
          [
            "want_to_try",
            `Want to try${wantToTryEntries.length ? ` (${wantToTryEntries.length})` : ""}`,
          ] as [Tab, string],
        ]
      : []),
    [
      "tried",
      `Tried${triedPlaces.length ? ` (${triedPlaces.length})` : ""}`,
    ] as [Tab, string],
    ...(features.favourites
      ? [
          [
            "favourites",
            `Favourites${favouritePlaces.length ? ` (${favouritePlaces.length})` : ""}`,
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
    <div className="animate-fade-in space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Places</h1>
          <p className="text-stone mt-1 text-sm">
            Everywhere the team knows about.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <LinkButton href="/places/new">Add</LinkButton>
        </div>
      </header>

      <HintCard page="places" icon="🔖">
        Filter by cuisine, budget, or walk time to narrow things down, and
        save anywhere you want to try or already love.
      </HintCard>

      {tabs.length > 1 && (
        <div className="border-line no-scrollbar flex gap-1 overflow-x-auto rounded-full border p-1 text-sm">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={
                "shrink-0 rounded-full px-3 py-1.5 transition-colors " +
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

      {tab === "want_to_try" ? (
        <WantToTryList
          entries={wantToTryEntries}
          loading={wishlistLoading}
          onBrowse={() => setTab("all")}
          onChanged={() => mutateWishlist()}
        />
      ) : tab === "tried" ? (
        <TriedList places={triedPlaces} loading={triedLoading} onBrowse={() => setTab("all")} />
      ) : tab === "favourites" ? (
        <FavouritesList
          places={favouritePlaces}
          loading={favouritesLoading}
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
        <Suspense fallback={<SkeletonRows count={6} rowClassName="h-28 w-full" />}>
          <BrowseList />
        </Suspense>
      )}
    </div>
  );
}

/**
 * A saved place, plus its own freeform reminder of what to actually try
 * there — "the laksa," "ask for the corner table." The reminder reuses
 * `PlaceCard`'s existing `why` slot to display (same ember arrow-line
 * treatment as a recommender's reasoning) and a small text link beneath the
 * card to add or edit it, rather than a persistent input on every row.
 */
function WantToTryRow({
  entry,
  onChanged,
}: {
  entry: WishlistEntry & { place: Place };
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);

  const saveNote = async () => {
    setBusy(true);
    try {
      await mutateJson("/api/wishlist", "PATCH", {
        place_id: entry.place_id,
        note: noteText.trim() || null,
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <PlaceCard
        place={entry.place}
        why={!editing && entry.note ? `Reminder: ${entry.note}` : undefined}
        action={<SaveActions placeId={entry.place_id} />}
      />
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-stone hover:text-ember tap-target-text mt-0.5 ml-1 text-xs underline"
        >
          {entry.note ? "Edit reminder" : "Add a reminder — what to try here"}
        </button>
      ) : (
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. the laksa"
            autoFocus
            className="border-line bg-paper w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-xs"
          />
          <Button size="sm" onClick={saveNote} disabled={busy}>
            Save
          </Button>
        </div>
      )}
    </li>
  );
}

function WantToTryList({
  entries,
  loading,
  onBrowse,
  onChanged,
}: {
  entries: (WishlistEntry & { place: Place })[];
  loading: boolean;
  onBrowse: () => void;
  onChanged: () => void;
}) {
  if (loading) return <SkeletonRows count={3} rowClassName="h-28 w-full" />;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<NoPlacesMotif />}
        title="Nothing saved yet"
        description="Tap the bookmark on any place to keep it here, with a spot to remind yourself what to try. Saving also nudges a place up your suggestions."
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
      {entries.map((entry) => (
        <WantToTryRow key={entry.place_id} entry={entry} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function FavouritesList({
  places,
  loading,
  onBrowse,
}: {
  places: Place[];
  loading: boolean;
  onBrowse: () => void;
}) {
  if (loading) return <SkeletonRows count={3} rowClassName="h-28 w-full" />;

  if (places.length === 0) {
    return (
      <EmptyState
        icon={<NoPlacesMotif />}
        title="No favourites yet"
        description="Tap the heart on any place you love to keep it here — independent of Want to try, so a place can be both."
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
          <PlaceCard place={place} action={<SaveActions placeId={place.id} />} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Never user-toggled, unlike Want to try/Favourites — a place lands here on
 * its own once you've logged a review for it, or actually attended a Jio
 * that was decided there (RSVP'd yes, or hosted). Distinct from Places'
 * "New to try" rail on the browse tab, which is the opposite idea — top
 * picks you've *never* been to.
 */
function TriedList({
  places,
  loading,
  onBrowse,
}: {
  places: Place[];
  loading: boolean;
  onBrowse: () => void;
}) {
  if (loading) return <SkeletonRows count={3} rowClassName="h-28 w-full" />;

  if (places.length === 0) {
    return (
      <EmptyState
        icon={<NoPlacesMotif />}
        title="Nothing tried yet"
        description="Log a review after eating somewhere, or attend a Jio that gets decided — either way, it'll show up here on its own."
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
          <PlaceCard place={place} action={<SaveActions placeId={place.id} />} />
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

  if (loading) return <SkeletonRows count={3} rowClassName="h-28 w-full" />;

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
                  <span className="flex shrink-0 items-center gap-1">
                    <SaveActions placeId={l.place.id} />
                    <button
                      type="button"
                      onClick={() => remove(l.id)}
                      className="text-stone hover:text-ink tap-target-text text-xs underline"
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
  const searchParams = useSearchParams();
  const excludeCuisine = searchParams.get("exclude") ?? undefined;
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
  if (filters.hasFoodpanda) baseQuery.set("hasFoodpanda", "true");
  if (filters.hasGrab) baseQuery.set("hasGrab", "true");
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

  // UX review log #6 — the personal-suggestion rails only make sense on a
  // plain browse: a search or an active cuisine filter is already a
  // specific intent, and stacking curated rails on top of that would read
  // as clutter rather than help.
  const isPlainBrowse = !filters.search && filters.cuisines.length === 0;

  return (
    <div className="space-y-5">
      <FilterBar value={filters} onChange={setFilters} showSort />

      {isPlainBrowse && <SuggestionRails excludeCuisine={excludeCuisine} />}

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
      {/* UX review log #14 — an 80px skeleton row against the real
          ~105-125px PlaceCard was a visible jump on every load. */}
      {isLoading && page === 1 && (
        <SkeletonRows count={6} rowClassName="h-28 w-full" />
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
                : filters.sortBy === "newly_rated"
                  ? "newest ratings first"
                  : "nearest first"}
          </p>
          <ul className="space-y-2">
            {places.map((place) => (
              <li key={place.id}>
                <PlaceCard
                  place={place}
                  action={<SaveActions placeId={place.id} />}
                />
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center pt-1">
              {isLoading && page > 1 ? (
                <SkeletonRows count={2} rowClassName="h-28 w-full" className="w-full" />
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
