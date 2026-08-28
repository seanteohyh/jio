"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Part 1 §E — a real date-range picker, replacing every analytics view's
 * fixed 90-day window (the gap the dashboard's own original comment
 * already flagged as deferred). Lives in the shared layout so the choice
 * persists across every tab, via a `?days=` URL param rather than
 * component state — shareable/bookmarkable, and survives a refresh.
 */
const PRESETS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 180, label: "180d" },
  { days: 365, label: "1y" },
] as const;

export const DEFAULT_ANALYTICS_DAYS = 90;

/** Reads the shared `?days=` param, falling back to the default. Every
 *  analytics page's SWR key should use this instead of hardcoding 90. */
export function useAnalyticsDays(): number {
  const searchParams = useSearchParams();
  const raw = Number(searchParams.get("days"));
  return PRESETS.some((p) => p.days === raw) ? raw : DEFAULT_ANALYTICS_DAYS;
}

export default function AdminDateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useAnalyticsDays();

  function select(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (days === DEFAULT_ANALYTICS_DAYS) {
      params.delete("days");
    } else {
      params.set("days", String(days));
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex gap-2 overflow-x-auto">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => select(p.days)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
            p.days === current
              ? "bg-ember text-white border-ember"
              : "border-line bg-paper text-stone hover:border-ember hover:text-ink"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
