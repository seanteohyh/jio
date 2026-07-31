"use client";

import { Chip, inputClass } from "./ui";
import { CUISINES, BUDGET_TIERS } from "@/lib/constants";
import { formatCuisine } from "@/lib/utils";
import type { BudgetTier } from "@/types";

export interface FilterState {
  search: string;
  cuisines: string[];
  budgetMax: BudgetTier;
  maxWalk: number;
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  cuisines: [],
  budgetMax: 4,
  maxWalk: 30,
};

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
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  showSearch?: boolean;
}) {
  const toggleCuisine = (cuisine: string) => {
    const next = value.cuisines.includes(cuisine)
      ? value.cuisines.filter((c) => c !== cuisine)
      : [...value.cuisines, cuisine];
    onChange({ ...value, cuisines: next });
  };

  return (
    <div className="space-y-3">
      {showSearch && (
        <input
          type="search"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Search places, dishes, cuisines"
          className={inputClass}
          aria-label="Search places"
        />
      )}

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {CUISINES.map((cuisine) => (
          <Chip
            key={cuisine}
            active={value.cuisines.includes(cuisine)}
            onClick={() => toggleCuisine(cuisine)}
          >
            {formatCuisine(cuisine)}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-stone">Up to</span>
          <select
            value={value.budgetMax}
            onChange={(e) =>
              onChange({
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
            max={45}
            step={5}
            value={value.maxWalk}
            onChange={(e) =>
              onChange({ ...value, maxWalk: Number(e.target.value) })
            }
            className="accent-ember min-w-24 flex-1"
            aria-label="Maximum walking minutes"
          />
        </label>

        {(value.cuisines.length > 0 ||
          value.budgetMax !== 4 ||
          value.maxWalk !== 30 ||
          value.search) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-ember text-xs underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
