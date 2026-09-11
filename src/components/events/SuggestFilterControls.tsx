"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import AreaPicker, { type AreaSelection } from "@/components/events/AreaPicker";
import { fetcher } from "@/lib/fetcher";
import { BUDGET_TIERS } from "@/lib/constants";
import { formatCuisine } from "@/lib/utils";
import type { BudgetTier, CuisineOption, Place } from "@/types";

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

/** Every pill in this row shares one flat, borderless-on-card look — no
 *  white `bg-paper` islands sitting on the card's `bg-cream`. */
function pillClass(active: boolean): string {
  return active
    ? "bg-ember shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-white"
    : "border-line text-stone hover:border-ember hover:text-ember shrink-0 rounded-full border px-2.5 py-1 text-xs";
}

function CuisinePicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { data } = useSWR<{ cuisines: CuisineOption[] }>(
    "/api/cuisines",
    fetcher
  );
  const cuisines = data?.cuisines ?? [];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // A wide chip strip either scrolled off both edges illegibly or wrapped
  // into a wall of chips — a dropdown keeps the row a fixed one-line height
  // regardless of how many cuisines exist.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (cuisines.length === 0) return null;

  const toggle = (slug: string) => {
    onChange(
      selected.includes(slug)
        ? selected.filter((c) => c !== slug)
        : [...selected, slug]
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={pillClass(selected.length > 0)}
      >
        Cuisine{selected.length > 0 ? ` (${selected.length})` : ""}
      </button>
      {open && (
        <div className="border-line bg-paper absolute top-full left-0 z-10 mt-1.5 max-h-64 w-52 overflow-y-auto rounded-lg border p-1.5 shadow-[var(--shadow-sm)]">
          {cuisines.map((c) => (
            <label
              key={c.slug}
              className="hover:bg-cream flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={selected.includes(c.slug)}
                onChange={() => toggle(c.slug)}
                className="accent-ember h-3.5 w-3.5"
              />
              {formatCuisine(c.slug)}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-ember mt-0.5 w-full rounded-md px-2 py-1 text-left text-xs underline"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SuggestFilterControls({
  value,
  onChange,
  surprise,
  onPickSurprise,
  onReroll,
}: {
  value: SuggestFilters;
  onChange: (next: SuggestFilters) => void;
  /** The recommender's one random pick for this same filter set — CHANGES
   *  §4's randomiser. Omit entirely (or pass `null`) where there's nothing
   *  to show yet. */
  surprise?: Place | null;
  onPickSurprise?: (placeId: string) => void;
  onReroll?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-stone text-xs">Suggestions near</span>
          <AreaPicker
            value={value.area}
            onChange={(area) => onChange({ ...value, area })}
          />
        </div>

        <CuisinePicker
          selected={value.cuisines}
          onChange={(cuisines) => onChange({ ...value, cuisines })}
        />

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
            className="border-line rounded-full border bg-transparent px-2.5 py-1 text-xs"
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

      {surprise && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-stone shrink-0 text-xs">Try:</span>
          <button
            type="button"
            onClick={() => onPickSurprise?.(surprise!.id)}
            className="border-ember text-ink shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium"
          >
            {surprise.name}
          </button>
          <button
            type="button"
            onClick={() => onReroll?.()}
            aria-label="Show a different random pick"
            title="Show a different random pick"
            className="border-line text-stone hover:border-ember hover:text-ember shrink-0 rounded-full border px-2 py-1 text-xs"
          >
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      )}
    </div>
  );
}
