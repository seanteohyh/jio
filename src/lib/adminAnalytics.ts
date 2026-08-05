import type { DateCount } from "@/types";

/**
 * Pure aggregation helpers behind the §13 admin analytics dashboard.
 *
 * Day/week bucketing uses Asia/Singapore as the day boundary (§13c) — the
 * app's evident timezone, not UTC. Singapore has no DST, so a fixed +8h
 * offset is exact, not an approximation.
 */

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO "YYYY-MM-DD" for the Asia/Singapore calendar day a timestamp falls on. */
export function sgtDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + SGT_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** ISO date of the Monday starting the Asia/Singapore week a timestamp falls in. */
export function sgtWeekKey(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + SGT_OFFSET_MS);
  const day = shifted.getUTCDay(); // 0 Sun .. 6 Sat, on the shifted clock
  const mondayOffset = day === 0 ? -6 : 1 - day;
  shifted.setUTCDate(shifted.getUTCDate() + mondayOffset);
  return shifted.toISOString().slice(0, 10);
}

function bucketBy(timestamps: string[], keyOf: (iso: string) => string): DateCount[] {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = keyOf(ts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function bucketByDay(timestamps: string[]): DateCount[] {
  return bucketBy(timestamps, sgtDateKey);
}

export function bucketByWeek(timestamps: string[]): DateCount[] {
  return bucketBy(timestamps, sgtWeekKey);
}

/** True when `iso` falls on the same Asia/Singapore calendar day as `reference`. */
export function isSameSgtDay(iso: string, reference: Date): boolean {
  return sgtDateKey(iso) === sgtDateKey(reference.toISOString());
}

/** Median of a numeric array. `null` for empty input — a median of "no
 *  data" is not a median of zero. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

const WALK_BUCKETS: { label: string; max: number }[] = [
  { label: "0–5 min", max: 5 },
  { label: "5–10 min", max: 10 },
  { label: "10–15 min", max: 15 },
  { label: "15–20 min", max: 20 },
  { label: "20+ min", max: Infinity },
];

export function bucketWalkMinutes(
  minutes: (number | null | undefined)[]
): { bucket: string; count: number }[] {
  const counts = new Map(WALK_BUCKETS.map((b) => [b.label, 0]));
  for (const m of minutes) {
    if (typeof m !== "number") continue;
    const bucket =
      WALK_BUCKETS.find((b) => m <= b.max) ?? WALK_BUCKETS[WALK_BUCKETS.length - 1];
    counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1);
  }
  return WALK_BUCKETS.map((b) => ({
    bucket: b.label,
    count: counts.get(b.label) ?? 0,
  }));
}
