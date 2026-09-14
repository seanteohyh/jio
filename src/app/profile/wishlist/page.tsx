"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { EmptyState, SkeletonDetail } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import type { WishlistEntry } from "@/types";

type SortMode = "nearest" | "recent";

export default function ProfileWishlistPage() {
  const { data, isLoading } = useSWR<{ wishlist: WishlistEntry[] }>(
    "/api/wishlist",
    fetcher
  );
  const [sort, setSort] = useState<SortMode>("nearest");

  const wishlist = data?.wishlist ?? [];
  const sorted = [...wishlist].sort((a, b) => {
    if (sort === "recent") {
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    }
    const aWalk = a.place?.walk_minutes ?? Infinity;
    const bWalk = b.place?.walk_minutes ?? Infinity;
    return aWalk - bWalk;
  });

  return (
    <div className="animate-fade-in space-y-4">
      <Link href="/profile" className="text-ember text-sm underline">
        ← Back to You
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Want to try &middot; {wishlist.length}
        </h1>
      </header>

      {isLoading ? (
        <SkeletonDetail />
      ) : wishlist.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save a place from its page and it'll show up here."
        />
      ) : (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone">
              {wishlist.length} place{wishlist.length === 1 ? "" : "s"}
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="bg-cream text-ink rounded-lg border-none px-2.5 py-1.5 text-xs"
            >
              <option value="nearest">Nearest first</option>
              <option value="recent">Recently added</option>
            </select>
          </div>

          <ul className="space-y-1.5">
            {sorted.map((entry) => (
              <li key={entry.place_id}>
                <Link
                  href={`/places/${entry.place_id}`}
                  className="border-line bg-cream/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      {entry.place?.name ?? "A place"}
                    </span>
                    {entry.note && (
                      <span className="text-stone block truncate text-xs">
                        {entry.note}
                      </span>
                    )}
                  </span>
                  {typeof entry.place?.walk_minutes === "number" && (
                    <span className="text-stone shrink-0 text-xs">
                      {entry.place.walk_minutes} min
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
