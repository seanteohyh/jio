"use client";

import { useState } from "react";
import useSWR from "swr";
import { Chip, inputClass } from "./ui";
import { BUDGET_TIERS } from "@/lib/constants";
import { formatCuisine } from "@/lib/utils";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import { SearchIcon } from "@/components/icons";
import type { BudgetTier, CuisineOption } from "@/types";

export interface FilterState {
  search: string;
  cuisines: string[];
  budgetMax: BudgetTier;
  maxWalk: number;
  /** "kaki_rating" — §12f — is computed at the API layer, not by the repo;
   *  see the sort branch in src/app/api/places/route.ts. "newly_rated"
   *  orders by `rating_updated_at`, a real, sortable column the repo
   *  already exposes. */
  sortBy: "walk" | "rating" | "kaki_rating" | "newly_rated";
  /** Narrows the list instead of just reordering it — CHANGES_20260807c.md
   *  §2's "real filter" gap on top of the existing sort. Also computed at
   *  the API layer, same place as the sort. */
  kakiFavouritesOnly: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  cuisines: [],
  budgetMax: 6,
  maxWalk: 30,
  sortBy: "walk",
  kakiFavouritesOnly: false,
};

/** The walk-time slider's ceiling — a place farther than this can never
 *  appear in Places or Map no matter how the slider is set, not just while
 *  it's at the default. Exported so a place far enough away can say so
 *  accurately rather than suggesting "widen the filter" when nothing would
 *  help. */
export const MAX_WALK_MINUTES = 45;

/**
 * Cuisine / budget / walk-time filters.
 *
 * The cuisine strip scrolls horizontally rather than wrapping into a wall of
 * seventeen chips — on a phone that wall pushes the actual results off screen.
 */
export default function FilterBar({
  value,
  onChange,
  showSearch = true,
  showSort = false,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  showSearch?: boolean;
  /** /places is the only list actually ordered by this — /map has no list
   *  order, so the control would be there but do nothing. (/suggest, which
   *  sorted by recommendation score, is retired — UX review log #6.) */
  showSort?: boolean;
}) {
  const { data: cuisinesData } = useSWR<{ cuisines: CuisineOption[] }>(
    "/api/cuisines",
    fetcher
  );
  const cuisines = cuisinesData?.cuisines ?? [];

  // Whether anything has been touched this session, not whether every field
  // currently equals DEFAULT_FILTERS — a value-equality check made "Clear"
  // flicker away mid-drag the instant the walk slider crossed back over its
  // own default (30), even though the slider visually sits mid-track and
  // gives no cue that 30 is special. Once touched, only the Clear button
  // itself (or a genuinely fresh mount) hides it again.
  const [touched, setTouched] = useState(false);

  const update = (next: FilterState) => {
    setTouched(true);
    onChange(next);
  };

  const clear = () => {
    setTouched(false);
    onChange(DEFAULT_FILTERS);
  };

  const toggleCuisine = (cuisine: string) => {
    const next = value.cuisines.includes(cuisine)
      ? value.cuisines.filter((c) => c !== cuisine)
      : [...value.cuisines, cuisine];
    update({ ...value, cuisines: next });
  };

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="relative">
          <SearchIcon
            className="text-stone pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={value.search}
            onChange={(e) => update({ ...value, search: e.target.value })}
            placeholder="Search places, dishes, cuisines"
            className={`${inputClass} pl-9`}
            aria-label="Search places"
          />
        </div>
      )}

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {cuisines.map((cuisine) => (
          <Chip
            key={cuisine.slug}
            active={value.cuisines.includes(cuisine.slug)}
            onClick={() => toggleCuisine(cuisine.slug)}
            pressed={value.cuisines.includes(cuisine.slug)}
          >
            {formatCuisine(cuisine.slug)}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {showSort && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-stone">Sort</span>
            <select
              value={value.sortBy}
              onChange={(e) =>
                update({
                  ...value,
                  sortBy: e.target.value as FilterState["sortBy"],
                })
              }
              className="border-line bg-paper rounded-lg border px-2 py-1 text-xs"
              aria-label="Sort places"
            >
              <option value="walk">Nearest</option>
              <option value="rating">Highest rated</option>
              <option value="newly_rated">Newly rated</option>
              {features.kakis && (
                <option value="kaki_rating">Rated by your Kaki group</option>
              )}
            </select>
          </label>
        )}

        {features.kakis && (
          <Chip
            active={value.kakiFavouritesOnly}
            onClick={() =>
              update({
                ...value,
                kakiFavouritesOnly: !value.kakiFavouritesOnly,
              })
            }
            pressed={value.kakiFavouritesOnly}
          >
            Kaki favourites only
          </Chip>
        )}

        <label className="flex items-center gap-2 text-xs">
          <span className="text-stone">Up to</span>
          <select
            value={value.budgetMax}
            onChange={(e) =>
              update({
                ...value,
                budgetMax: Number(e.target.value) as BudgetTier,
              })
            }
            className="border-line bg-paper rounded-lg border px-2 py-1 text-xs"
            aria-label="Maximum budget"
          >
            {BUDGET_TIERS.map((tier) => (
              <option key={tier.tier} value={tier.tier}>
                {tier.label} ({tier.description})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 items-center gap-2 text-xs">
          <span className="text-stone whitespace-nowrap">
            Within {value.maxWalk} min
          </span>
          <input
            type="range"
            min={5}
            max={MAX_WALK_MINUTES}
            step={5}
            value={value.maxWalk}
            onChange={(e) =>
              update({ ...value, maxWalk: Number(e.target.value) })
            }
            className="accent-ember min-w-24 flex-1"
            aria-label="Maximum walking minutes"
          />
        </label>

        {touched && (
          <button
            type="button"
            onClick={clear}
            className="text-ember text-xs underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
