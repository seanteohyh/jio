"use client";

import AreaPicker, { type AreaSelection } from "@/components/events/AreaPicker";
import CuisinePicker from "@/components/CuisinePicker";
import { BUDGET_TIERS } from "@/lib/constants";
import type { BudgetTier, Place } from "@/types";

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

export default function SuggestFilterControls({
  value,
  onChange,
  surprises,
  onPickSurprise,
  onReroll,
}: {
  value: SuggestFilters;
  onChange: (next: SuggestFilters) => void;
  /** The recommender's random picks for this same filter set — CHANGES §4's
   *  randomiser, showing a small batch to tap through (rather than one at a
   *  time) so a reroll is worth reaching for less often. Each is drawn from
   *  (and so already respects) the exact same filtered/ranked list the
   *  "Suggested for you" chips use. Omit entirely (or pass `[]`) where
   *  there's nothing to show yet. */
  surprises?: Place[];
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
          trigger={({ onClick, open, label }) => (
            <button
              type="button"
              onClick={onClick}
              aria-haspopup="true"
              aria-expanded={open}
              className={pillClass(value.cuisines.length > 0)}
            >
              {label}
            </button>
          )}
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

      {surprises && surprises.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-stone shrink-0 text-xs">Try:</span>
          {surprises.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => onPickSurprise?.(place.id)}
              className="border-ember text-ink min-w-0 truncate rounded-full border px-2.5 py-1 text-xs font-medium"
            >
              {place.name}
            </button>
          ))}
          {/* Pinned to the row's own right edge (`ml-auto`), not placed
              right after the last chip — its screen position then depends
              only on the row's own (stable) width, never on how long the
              current picks' names happen to be. A trailing position that
              instead followed the chips directly reflowed on every reroll (a
              shorter/longer name shifting whatever came after it), so a
              second tap meant for reroll could land on a chip that had
              shifted into its old spot instead (iOS report: "accidentally
              click the place when trying to randomise"). Sized as a real,
              visible 44px circle rather than an invisible expanded hit-area
              over a smaller glyph (`.tap-target-text`'s negative-margin
              trick, meant for a plain text link with no chrome of its own —
              applied to this bordered/filled button, that same negative
              margin shifted the *visible* circle itself up and to the left,
              reading as a stray, half-cut-off shape floating past the
              card's edge rather than a small control in its own row). */}
          <button
            type="button"
            onClick={() => onReroll?.()}
            aria-label="Show a different set of random picks"
            title="Show a different set of random picks"
            className="border-line bg-paper text-stone hover:border-ember hover:text-ember ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-base leading-none"
          >
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      )}
    </div>
  );
}
