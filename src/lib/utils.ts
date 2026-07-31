import { WALK_SPEED_M_PER_MIN } from "./constants";
import type { Place } from "@/types";

/** Great-circle distance in metres between two lat/lng points. */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Straight-line walk estimate. Real street routing is longer, so this is a
 * floor, not a promise. The OneMap routing provider replaces it when available.
 */
export function estimateWalkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / WALK_SPEED_M_PER_MIN));
}

/**
 * The default sort for the plain `/places` browse list: nearest first.
 *
 * `walk_minutes` is already a stored/cached column, so this is a cheap
 * `ORDER BY` — unlike a rating-based sort, which would need a visits fetch.
 * Rating is deliberately excluded from the tiebreak for the same reason.
 * A place with no cached walk time yet sorts last, not as "closest".
 */
export function sortPlacesForList(places: Place[]): Place[] {
  return [...places].sort((a, b) => {
    const aWalk = typeof a.walk_minutes === "number" ? a.walk_minutes : Infinity;
    const bWalk = typeof b.walk_minutes === "number" ? b.walk_minutes : Infinity;
    if (aWalk !== bWalk) return aWalk - bWalk;

    const aVisits = a.visit_count ?? 0;
    const bVisits = b.visit_count ?? 0;
    if (aVisits !== bVisits) return bVisits - aVisits;

    return a.name.localeCompare(b.name);
  });
}

/** Tiny className joiner. Falsy values are dropped. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** "fast_food" -> "Fast Food" */
export function formatCuisine(cuisine: string): string {
  return cuisine
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * True when the app should use the in-memory demo store.
 * Kept as a standalone function because both server and client code read it.
 */
export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    return (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** "2026-07-29" -> "Wed, 29 Jul" */
export function formatDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTime(input: string | Date): string {
  return `${formatDate(input)} · ${formatTime(input)}`;
}

/** "2026-07" -> "July 2026" */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-SG", { month: "long", year: "numeric" });
}

/** Relative day label used in event lists. */
export function relativeDayLabel(input: string | Date, now = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("en-SG", { weekday: "long" });
  }
  return formatDate(d);
}

/** Crypto-random URL-safe token for invite links. */
export function generateToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for older runtimes.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Deterministic colour for an avatar chip, derived from a user id. */
export function avatarColor(seed: string): string {
  const palette = [
    "#b4532f",
    "#567b57",
    "#a87b2d",
    "#6b6091",
    "#3f6b78",
    "#8c4a52",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Group an array into a Map keyed by the result of `keyFn`. */
export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
