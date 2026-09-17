"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, SectionHeading, inputClass } from "@/components/ui";
import JioForm from "@/components/events/JioForm";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { KakiWishlistEntry, Place } from "@/types";

/**
 * Group-level counterpart to the personal wishlist — CHANGES: Shared Kaki
 * wishlist. Any current member can add or remove an entry (migration 093);
 * "Jio this" jumps straight into starting a Jio with that place and this
 * Kaki pre-selected, reusing `JioForm` exactly the way `HomeHero` already
 * does for its own inline form.
 */
export default function KakiWishlistCard({
  kakiId,
  canEdit,
}: {
  kakiId: string;
  canEdit: boolean;
}) {
  const { data, mutate } = useSWR<{ wishlist: KakiWishlistEntry[] }>(
    `/api/kakis/${kakiId}/wishlist`,
    fetcher
  );
  const wishlist = data?.wishlist ?? [];

  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [jioingPlaceId, setJioingPlaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim();
  const { data: searchData } = useSWR<{ places: Place[] }>(
    needle.length >= 2 ? `/api/places?q=${encodeURIComponent(needle)}` : null,
    fetcher
  );
  const existingIds = useMemo(
    () => new Set(wishlist.map((e) => e.place_id)),
    [wishlist]
  );
  const results = useMemo(
    () => (searchData?.places ?? []).filter((p) => !existingIds.has(p.id)),
    [searchData, existingIds]
  );

  const add = async (placeId: string) => {
    setAddingId(placeId);
    setError(null);
    try {
      const result = await mutateJson<{ entry: KakiWishlistEntry }>(
        `/api/kakis/${kakiId}/wishlist`,
        "POST",
        { place_id: placeId }
      );
      mutate({ wishlist: [result.entry, ...wishlist] }, false);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    } finally {
      setAddingId(null);
    }
  };

  const remove = async (entryId: string) => {
    setRemovingId(entryId);
    setError(null);
    try {
      await mutateJson(`/api/kakis/${kakiId}/wishlist/${entryId}`, "DELETE");
      mutate(
        { wishlist: wishlist.filter((e) => e.id !== entryId) },
        false
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="space-y-3">
      <SectionHeading>Wishlist</SectionHeading>
      <p className="text-stone -mt-1 text-xs">
        Places this group wants to try — anyone can add or clear one.
      </p>

      {error && <p className="text-ember text-xs">{error}</p>}

      {wishlist.length === 0 ? (
        <p className="text-stone text-xs">Nothing on the list yet.</p>
      ) : (
        <ul className="space-y-2">
          {wishlist.map((entry) => (
            <li key={entry.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/places/${entry.place_id}`}
                    className="truncate text-sm font-medium underline"
                  >
                    {entry.place?.name ?? "A place"}
                  </Link>
                  {entry.added_by_name && (
                    <p className="text-stone truncate text-xs">
                      Added by {entry.added_by_name}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setJioingPlaceId(
                        jioingPlaceId === entry.place_id ? null : entry.place_id
                      )
                    }
                  >
                    Jio this
                  </Button>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={removingId === entry.id}
                      onClick={() => remove(entry.id)}
                    >
                      {removingId === entry.id ? "…" : "Remove"}
                    </Button>
                  )}
                </div>
              </div>

              {jioingPlaceId === entry.place_id && (
                <JioForm
                  variant="inline"
                  onCancel={() => setJioingPlaceId(null)}
                  initialPlaceIds={[entry.place_id]}
                  initialInvite={{ userIds: [], kakiIds: [kakiId] }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="border-line space-y-2 border-t pt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
            placeholder="Search a place to add…"
            autoComplete="off"
          />
          {results.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {results.map((place) => (
                <div
                  key={place.id}
                  className="hover:bg-cream flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{place.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={addingId === place.id}
                    onClick={() => add(place.id)}
                  >
                    {addingId === place.id ? "…" : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
