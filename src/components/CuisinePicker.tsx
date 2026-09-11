"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { formatCuisine } from "@/lib/utils";
import type { CuisineOption } from "@/types";

/**
 * A multi-select cuisine dropdown, shared by every filter row in the app
 * (Places/Map's FilterBar, a Jio's ballot-builder) rather than each having
 * its own horizontally-scrolling chip strip — that either overflows
 * illegibly or wraps into several rows depending on how many cuisines
 * exist, where a fixed-height dropdown holds its size regardless.
 *
 * The panel measures its own trigger against the viewport on open and
 * hangs off whichever edge keeps it fully on-screen (an iOS report: a
 * fixed left-aligned panel ran off the right edge whenever the trigger
 * landed in the second half of a wrapped row) rather than assuming a
 * fixed side.
 *
 * The trigger button itself is a render prop rather than a fixed style —
 * callers with different pill/chip looks (a bordered `Chip` in FilterBar,
 * a flat pill in the ballot-builder) share this exact dropdown behaviour
 * without sharing a visual style neither of them actually wants.
 */
export default function CuisinePicker({
  selected,
  onChange,
  trigger,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  trigger: (props: {
    onClick: () => void;
    open: boolean;
    label: string;
  }) => React.ReactNode;
}) {
  const { data } = useSWR<{ cuisines: CuisineOption[] }>(
    "/api/cuisines",
    fetcher
  );
  const cuisines = data?.cuisines ?? [];
  const [open, setOpen] = useState(false);
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
      {trigger({
        onClick: openPanel,
        open,
        label: `Cuisine${selected.length > 0 ? ` (${selected.length})` : ""}`,
      })}
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
