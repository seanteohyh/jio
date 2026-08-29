"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { BookmarkIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { WishlistEntry } from "@/types";

/**
 * Save a place for later — the wishlist, wearing a name people recognise.
 *
 * The wishlist has existed since migration 008 and is one of the strongest
 * inputs to the recommender (`wishlistBoost`, weight 2.0 — level with cuisine
 * affinity). Until now there was no control to add to it and no screen showing
 * it, which made the single lever a user has over their own suggestions
 * invisible. This is that control; `/places` grows the screen.
 *
 * Deliberately reads the whole wishlist rather than taking an `isSaved` prop:
 * the list is small, SWR dedupes it across every card on the page, and a single
 * shared cache key means toggling one card updates every other view of the same
 * place at once.
 */
export default function SaveButton({
  placeId,
  className,
}: {
  placeId: string;
  className?: string;
}) {
  const { data } = useSWR<{ wishlist: WishlistEntry[] }>(
    features.wishlist ? "/api/wishlist" : null,
    fetcher
  );
  const showToast = useToast();

  if (!features.wishlist) return null;

  const saved = (data?.wishlist ?? []).some((w) => w.place_id === placeId);

  const toggle = async (event: React.MouseEvent) => {
    // Cards are wrapped in links to the place — saving should not navigate.
    event.preventDefault();
    event.stopPropagation();

    // Optimistic: the bookmark flips the instant you tap it, not once the
    // round trip finishes (CHANGES_20260804.md §5 — waiting for the full
    // client → Vercel → Supabase → back trip before any visual change is
    // what "laggy" actually was). SWR rolls the icon back on its own if the
    // request fails.
    const current = data?.wishlist ?? [];
    const optimisticList = saved
      ? current.filter((w) => w.place_id !== placeId)
      : [
          ...current,
          {
            user_id: "optimistic",
            place_id: placeId,
            created_at: new Date().toISOString(),
          } as WishlistEntry,
        ];

    showToast(saved ? "Removed from Want to try" : "Saved to Want to try");

    await globalMutate(
      "/api/wishlist",
      fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      }).then(() => fetcher<{ wishlist: WishlistEntry[] }>("/api/wishlist")),
      {
        optimisticData: { wishlist: optimisticList },
        rollbackOnError: true,
        revalidate: false,
      }
    );
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Saved — tap to remove" : "Save for later"}
      title={saved ? "Saved" : "Save for later"}
      className={
        "shrink-0 rounded-full p-1 transition-colors " +
        (saved
          ? "text-ember"
          : "text-stone hover:text-ember") +
        (className ? ` ${className}` : "")
      }
    >
      <BookmarkIcon
        className="h-4 w-4"
        strokeWidth={1.75}
        fill={saved ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
}
