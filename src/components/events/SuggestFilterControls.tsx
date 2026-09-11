"use client";

import useSWR from "swr";
import AreaPicker, { type AreaSelection } from "@/components/events/AreaPicker";
import { fetcher } from "@/lib/fetcher";
import { BUDGET_TIERS } from "@/lib/constants";
import { formatCuisine } from "@/lib/utils";
import type { BudgetTier, CuisineOption } from "@/types";

/**
 * Everything `/api/suggest` can narrow by, shared between the create-a-Jio
 * form and the post-creation "Find a place" panel so both filter the exact
 * same way — CHANGES §5's ask for parity between the two.
 */
export interface SuggestFilters {
  area: AreaSelection | null;
  budgetMax: BudgetTier;
  newOnly: boolean;
  cuisines: string[];
  hasFoodpanda: boolean;
  hasGrab: boolean;
}

export const DEFAULT_SUGGEST_FILTERS: SuggestFilters = {
  area: null,
  budgetMax: 6,
  newOnly: false,
  cuisines: [],
  hasFoodpanda: false,
  hasGrab: false,
};

/** Builds the `&key=value` tail for an `/api/suggest` query string. */
export function suggestFilterParams(filters: SuggestFilters): string {
  const parts: string[] = [];
  if (filters.area) {
    parts.push(`areaLat=${filters.area.lat}`, `areaLng=${filters.area.lng}`);
  }
  if (filters.budgetMax !== 6) parts.push(`budgetMax=${filters.budgetMax}`);
  if (filters.newOnly) parts.push(`excludeVisited=true`);
  if (filters.cuisines.length > 0) {
    parts.push(
      `cuisines=${filters.cuisines.map(encodeURIComponent).join(",")}`
    );
  }
  if (filters.hasFoodpanda) parts.push(`hasFoodpanda=true`);
  if (filters.hasGrab) parts.push(`hasGrab=true`);
  return parts.length > 0 ? `&${parts.join("&")}` : "";
}

function pillClass(active: boolean): string {
  return active
    ? "bg-ember shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-white"
    : "border-line text-stone hover:border-ember hover:text-ember shrink-0 rounded-full border px-2.5 py-1 text-xs";
}

export default function SuggestFilterControls({
  value,
  onChange,
}: {
  value: SuggestFilters;
  onChange: (next: SuggestFilters) => void;
}) {
  const { data } = useSWR<{ cuisines: CuisineOption[] }>(
    "/api/cuisines",
    fetcher
  );
  const cuisines = data?.cuisines ?? [];

  const toggleCuisine = (slug: string) => {
    const next = value.cuisines.includes(slug)
      ? value.cuisines.filter((c) => c !== slug)
      : [...value.cuisines, slug];
    onChange({ ...value, cuisines: next });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-stone text-xs">Suggestions near</span>
        <AreaPicker
          value={value.area}
          onChange={(area) => onChange({ ...value, area })}
        />
      </div>

      {cuisines.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {cuisines.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => toggleCuisine(c.slug)}
              aria-pressed={value.cuisines.includes(c.slug)}
              className={pillClass(value.cuisines.includes(c.slug))}
            >
              {formatCuisine(c.slug)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
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
            aria-label="Maximum budget for suggestions"
          >
            {BUDGET_TIERS.map((tier) => (
              <option key={tier.tier} value={tier.tier}>
                {tier.label} ({tier.description})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => onChange({ ...value, newOnly: !value.newOnly })}
          aria-pressed={value.newOnly}
          className={pillClass(value.newOnly)}
        >
          New to you only
        </button>

        <button
          type="button"
          onClick={() =>
            onChange({ ...value, hasFoodpanda: !value.hasFoodpanda })
          }
          aria-pressed={value.hasFoodpanda}
          className={pillClass(value.hasFoodpanda)}
        >
          On Foodpanda
        </button>

        <button
          type="button"
          onClick={() => onChange({ ...value, hasGrab: !value.hasGrab })}
          aria-pressed={value.hasGrab}
          className={pillClass(value.hasGrab)}
        >
          On Grab
        </button>
      </div>
    </div>
  );
}
