"use client";

import { useState } from "react";
import { Chip, inputClass } from "./ui";
import { BUDGET_TIERS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { features } from "@/lib/config";
import { SearchIcon } from "@/components/icons";
import CuisinePicker from "@/components/CuisinePicker";
import type { BudgetTier, Place } from "@/types";

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
  /** Presence-only filters, same "narrows the list" shape and same
   *  API-layer computation as kakiFavouritesOnly above. */
  hasFoodpanda: boolean;
  hasGrab: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  cuisines: [],
  budgetMax: 6,
  maxWalk: 30,
  sortBy: "walk",
  kakiFavouritesOnly: false,
  hasFoodpanda: false,
  hasGrab: false,
};

/** The walk-time slider's ceiling — a place farther than this can never
 *  appear in Places or Map no matter how the slider is set, not just while
 *  it's at the default. Exported so a place far enough away can say so
 *  accurately rather than suggesting "widen the filter" when nothing would
 *  help. */
export const MAX_WALK_MINUTES = 45;

/**
 * The same narrowing `/api/places` applies server-side (`applyFilters` in
 * demoRepo.ts / the equivalent Supabase query), reimplemented as a pure
 * client-side predicate so the same `FilterState` can also narrow the
 * already-fetched, unpaginated Want to try / Tried / Favourites lists —
 * those never round-trip through the API on a filter change, so filtering
 * them needs to happen in the browser instead. `kakiFavouritesOnly` and
 * `sortBy: "kaki_rating"` are deliberately not reproduced here: both need
 * a Kaki-scoped rating computed specially for the sorted browse list, never
 * populated on a place object fetched any other way, so they stay specific
 * to the "All" tab's own server-backed list.
 */
export function filterPlaces(
  places: Place[],
  filters: FilterState,
  options?: {
    /** The walk-time slider defaults to 30 min — right for a plain browse,
     *  where that's a bias toward what's nearby, but wrong for a saved list
     *  that's never been walk-filtered at all (a Want-to-try place saved
     *  from across town would otherwise vanish the instant this filter
     *  starts applying to it, with no cue why). Off by default; the caller
     *  passes `true` once the walk slider has actually been touched this
     *  session, same "touched, not value-equals-default" flag `FilterBar`
     *  already tracks for its own Clear link. */
    applyMaxWalk?: boolean;
  }
): Place[] {
  let result = places;

  if (filters.cuisines.length > 0) {
    result = result.filter((p) => p.cuisine.some((c) => filters.cuisines.includes(c)));
  }
  if (filters.budgetMax < 6) {
    result = result.filter((p) => p.budget_tier <= filters.budgetMax);
  }
  if (options?.applyMaxWalk && filters.maxWalk < MAX_WALK_MINUTES) {
    result = result.filter(
      (p) => typeof p.walk_minutes !== "number" || p.walk_minutes <= filters.maxWalk
    );
  }
  if (filters.hasFoodpanda) result = result.filter((p) => !!p.foodpanda_url);
  if (filters.hasGrab) result = result.filter((p) => !!p.grab_url);
  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.address || "").toLowerCase().includes(needle) ||
        p.best_dishes.some((d) => d.toLowerCase().includes(needle)) ||
        p.cuisine.some((c) => c.toLowerCase().includes(needle))
    );
  }

  return result;
}

/**
 * Cuisine / budget / walk-time filters, shared above every tab on Places
 * (and Map's own equivalent) rather than owned by any one list — the same
 * search, cuisine, budget, walk-time and Foodpanda/Grab narrowing now
 * applies to Want to try / Tried / Favourites too, not just the plain
 * browse ("All") tab.
 *
 * Cuisine is a multi-select dropdown (`CuisinePicker`), not a horizontally
 * scrolling chip strip — that either overflowed illegibly or wrapped into
 * several rows depending on how many cuisines existed, where a fixed-size
 * dropdown button holds its size regardless.
 */
export default function FilterBar({
  value,
  onChange,
  showSearch = true,
  showSort = false,
  showKakiFilter = true,
  onTouchedChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  showSearch?: boolean;
  /** /places is the only list actually ordered by this — /map has no list
   *  order, so the control would be there but do nothing. (/suggest, which
   *  sorted by recommendation score, is retired — UX review log #6.) */
  showSort?: boolean;
  /** "Kaki favourites only" needs a Kaki-scoped rating only ever computed
   *  for the sorted, server-backed browse list (see `filterPlaces` above) —
   *  hidden on any tab whose places didn't come from that same fetch, since
   *  it would silently do nothing there. */
  showKakiFilter?: boolean;
  /** Mirrors this bar's own "has anything been touched this session" flag
   *  out to the parent — used to decide whether the walk-time filter
   *  should actually narrow a tab that was never walk-filtered to begin
   *  with (see `filterPlaces`'s `applyMaxWalk` option). */
  onTouchedChange?: (touched: boolean) => void;
}) {
  // Whether anything has been touched this session, not whether every field
  // currently equals DEFAULT_FILTERS — a value-equality check made "Clear"
  // flicker away mid-drag the instant the walk slider crossed back over its
  // own default (30), even though the slider visually sits mid-track and
  // gives no cue that 30 is special. Once touched, only the Clear button
  // itself (or a genuinely fresh mount) hides it again.
  const [touched, setTouched] = useState(false);

  const update = (next: FilterState) => {
    setTouched(true);
    onTouchedChange?.(true);
    onChange(next);
  };

  const clear = () => {
    setTouched(false);
    onTouchedChange?.(false);
    onChange(DEFAULT_FILTERS);
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

      <div className="flex flex-wrap items-center gap-4">
        <CuisinePicker
          selected={value.cuisines}
          onChange={(cuisines) => update({ ...value, cuisines })}
          trigger={({ onClick, open, label }) => (
            <button
              type="button"
              onClick={onClick}
              aria-haspopup="true"
              aria-expanded={open}
              aria-pressed={value.cuisines.length > 0}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-3.5 text-xs transition-[color,background-color,transform] duration-150 active:scale-[0.97]",
                value.cuisines.length > 0
                  ? "bg-ember text-white"
                  : "border-line bg-paper text-stone hover:border-ember hover:text-ink border"
              )}
            >
              {label}
            </button>
          )}
        />

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
              {features.kakis && showKakiFilter && (
                <option value="kaki_rating">Rated by your Kaki group</option>
              )}
            </select>
          </label>
        )}

        {features.kakis && showKakiFilter && (
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

        <Chip
          active={value.hasFoodpanda}
          onClick={() =>
            update({ ...value, hasFoodpanda: !value.hasFoodpanda })
          }
          pressed={value.hasFoodpanda}
        >
          On Foodpanda
        </Chip>

        <Chip
          active={value.hasGrab}
          onClick={() => update({ ...value, hasGrab: !value.hasGrab })}
          pressed={value.hasGrab}
        >
          On Grab
        </Chip>

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
