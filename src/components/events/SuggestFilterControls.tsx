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
  // Which edge of the trigger button the panel hangs off — a fixed `left-0`
  // ran off the right edge of the screen whenever the button itself landed
  // in the second half of a wrapped row (iOS report: "right side cut off").
  // Measured against the viewport on open rather than assumed, since where
  // the button lands depends on how the rest of the row happens to wrap.
  const [align, setAlign] = useState<"left" | "right">("left");
  const ref = useRef<HTMLDivElement>(null);
  const panelWidthPx = 208; // matches w-52 below

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

  const openPanel = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const overflowsRight = rect.left + panelWidthPx > window.innerWidth - 16;
      setAlign(overflowsRight ? "right" : "left");
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openPanel}
        aria-haspopup="true"
        aria-expanded={open}
        className={pillClass(selected.length > 0)}
      >
        Cuisine{selected.length > 0 ? ` (${selected.length})` : ""}
      </button>
      {open && (
        <div
          className={`border-line bg-paper absolute top-full z-10 mt-1.5 max-h-64 w-52 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border p-1.5 shadow-[var(--shadow-sm)] ${align === "left" ? "left-0" : "right-0"}`}
        >
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
        <AreaPicker
          value={value.area}
          onChange={(area) => onChange({ ...value, area })}
        />

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
        <div className="flex items-center gap-1.5">
          {/* Reroll comes first and never changes size, so it stays under
              the same finger position on repeated taps — with it last, a
              shorter/longer name reflowed the row and the button that used
              to be under your thumb became the place pill instead (iOS
              report: "accidentally click the place when trying to
              randomise"). `tap-target-text` (UX review log #2) grows the
              real hit area to ~44px without the glyph itself growing. */}
          <button
            type="button"
            onClick={() => onReroll?.()}
            aria-label="Show a different random pick"
            title="Show a different random pick"
            className="tap-target-text border-line bg-paper text-stone hover:border-ember hover:text-ember shrink-0 rounded-full border text-base leading-none"
          >
            <span aria-hidden="true">↻</span>
          </button>
          <span className="text-stone shrink-0 text-xs">Try:</span>
          <button
            type="button"
            onClick={() => onPickSurprise?.(surprise!.id)}
            className="border-ember text-ink min-w-0 truncate rounded-full border px-2.5 py-1 text-xs font-medium"
          >
            {surprise.name}
          </button>
        </div>
      )}
    </div>
  );
}
