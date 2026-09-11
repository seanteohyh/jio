"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useToast } from "@/components/Toast";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { FavouriteEntry } from "@/types";

/**
 * Favourite a place — a second, independent personal list from the
 * wishlist ("Want to try"): a place can be saved to either, both, or
 * neither. Same shape as `SaveButton` in every respect but the endpoint and
 * icon (a plain heart glyph, matching the one Lobang reactions already
 * use, rather than introducing a second icon component for one glyph).
 */
export default function FavouriteButton({
  placeId,
  className,
}: {
  placeId: string;
  className?: string;
}) {
  const { data } = useSWR<{ favourites: FavouriteEntry[] }>(
    features.favourites ? "/api/favourites" : null,
    fetcher
  );
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  if (!features.favourites) return null;

  const favourited = (data?.favourites ?? []).some(
    (f) => f.place_id === placeId
  );

  const toggle = async (event: React.MouseEvent) => {
    // Cards are wrapped in links to the place — favouriting should not navigate.
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setBusy(true);

    const current = data?.favourites ?? [];
    const optimisticList = favourited
      ? current.filter((f) => f.place_id !== placeId)
      : [
          ...current,
          {
            user_id: "optimistic",
            place_id: placeId,
            created_at: new Date().toISOString(),
          } as FavouriteEntry,
        ];

    showToast(favourited ? "Removed from Favourites" : "Added to Favourites");

    try {
      await globalMutate(
        "/api/favourites",
        fetch("/api/favourites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place_id: placeId }),
        }).then(() =>
          fetcher<{ favourites: FavouriteEntry[] }>("/api/favourites")
        ),
        {
          optimisticData: { favourites: optimisticList },
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={favourited}
      aria-label={favourited ? "Favourited — tap to remove" : "Add to favourites"}
      title={favourited ? "Favourited" : "Add to favourites"}
      className={
        "shrink-0 rounded-full p-1 text-base leading-none transition-colors " +
        (favourited ? "text-ember" : "text-stone hover:text-ember") +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-hidden="true">{favourited ? "♥" : "♡"}</span>
    </button>
  );
}
