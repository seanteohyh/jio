import { WALK_SPEED_M_PER_MIN } from "./constants";
import type { Lobang, Place } from "@/types";

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
 * The sort for the plain `/places` browse list: nearest first by default,
 * or highest rated first (CHANGES_20260803.md §12e).
 *
 * Both `walk_minutes` and `avg_rating` are stored/cached columns
 * (021/022_*.sql maintain avg_rating via trigger), so either order is a
 * cheap `ORDER BY` — no visits fetch needed for a rating sort. A place with
 * no cached walk time, or no ratings yet, sorts last on that axis rather
 * than being treated as "closest" or "worst".
 */
export function sortPlacesForList(
  places: Place[],
  sortBy: "walk" | "rating" | "newly_rated" = "walk"
): Place[] {
  return [...places].sort((a, b) => {
    if (sortBy === "rating") {
      const aRating = typeof a.avg_rating === "number" ? a.avg_rating : -Infinity;
      const bRating = typeof b.avg_rating === "number" ? b.avg_rating : -Infinity;
      if (aRating !== bRating) return bRating - aRating;
    }

    if (sortBy === "newly_rated") {
      // Nulls (no visits logged yet) sort last, same "unrated falls to the
      // bottom" convention "rating" already uses above.
      const aRated = a.rating_updated_at ? Date.parse(a.rating_updated_at) : -Infinity;
      const bRated = b.rating_updated_at ? Date.parse(b.rating_updated_at) : -Infinity;
      if (aRated !== bRated) return bRated - aRated;
    }

    const aWalk = typeof a.walk_minutes === "number" ? a.walk_minutes : Infinity;
    const bWalk = typeof b.walk_minutes === "number" ? b.walk_minutes : Infinity;
    if (aWalk !== bWalk) return aWalk - bWalk;

    const aVisits = a.visit_count ?? 0;
    const bVisits = b.visit_count ?? 0;
    if (aVisits !== bVisits) return bVisits - aVisits;

    return a.name.localeCompare(b.name);
  });
}

export type LobangFeedItem = Lobang & { direction: "received" | "sent" };

/**
 * Merges a received list and a sent list into one reverse-chronological
 * feed — CHANGES_20260816.md §2's "browse" page. Pure so the ordering is
 * unit-testable without a component; both API responses already carry
 * everything the feed needs (display names, place, event title), so this
 * is purely tag-and-sort, no fetching.
 */
export function mergeLobangFeed(
  received: Lobang[],
  sent: Lobang[]
): LobangFeedItem[] {
  return [
    ...received.map((l) => ({ ...l, direction: "received" as const })),
    ...sent.map((l) => ({ ...l, direction: "sent" as const })),
  ].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

/**
 * One tap cycles a cuisine preference neutral -> like -> dislike -> neutral
 * (CHANGES_20260816.md §3) — replaces the profile page's old two
 * independent chip grids, which doubled both the space and the scanning
 * needed for what's conceptually a single 3-state choice per cuisine. The
 * wire format is unchanged, still two arrays; pure so the transition table
 * is testable without a component.
 */
export function cycleCuisinePreference(
  cuisine: string,
  likes: string[],
  dislikes: string[]
): { likes: string[]; dislikes: string[] } {
  if (likes.includes(cuisine)) {
    return {
      likes: likes.filter((v) => v !== cuisine),
      dislikes: [...dislikes, cuisine],
    };
  }
  if (dislikes.includes(cuisine)) {
    return { likes, dislikes: dislikes.filter((v) => v !== cuisine) };
  }
  return { likes: [...likes, cuisine], dislikes };
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
 * Short "what kind of place is this" descriptor — cuisine tags then
 * free-text custom tags, the same combination `PlaceCard` uses for its pill
 * row, just joined as compact text for a list row instead of a row of
 * pills. CHANGES_20260812.md §3: voting on an unfamiliar place currently
 * shows only its name; this is the data already sitting in `EventOption
 * .place` on both the ballot and the standing, just never rendered.
 */
export function placeDescriptor(
  place: Pick<Place, "cuisine" | "custom_cuisine_tags">,
  limit = 2
): string {
  return [...place.cuisine.map(formatCuisine), ...place.custom_cuisine_tags]
    .slice(0, limit)
    .join(", ");
}

/**
 * Word-overlap similarity between two names, 0 (nothing shared) to 1
 * (identical word sets) — lowercased, punctuation stripped, split on
 * whitespace, compared as sets rather than as strings so word order and
 * repeats don't matter ("Two Men Bagel House" vs "Two Men Bagel House
 * (Enggor St)" scores the same as an exact match). Deliberately simple: this
 * only has to clear a confidence bar for a Google Places match
 * (CHANGES_20260814.md §2), not rank close alternatives against each other.
 */
export function nameSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;

  return shared / new Set([...setA, ...setB]).size;
}

/**
 * Normalizes a typed cuisine label into its stored slug — CHANGES_20260818.md
 * §6. Same "lowercase, trimmed" discipline as `nameAuth`'s name matching,
 * plus collapsing whitespace to underscores so a multi-word cuisine slugs
 * the same way the original 18 do ("fast_food", "food_court") — the same
 * convention `formatCuisine()` below already assumes when it reverses this
 * exact transform for display. Catches exact duplicates ("Korean BBQ" /
 * "korean bbq") for free; near-duplicates ("KBBQ") are a known, accepted
 * gap the doc decided not to guard against at entry, cleaned up later
 * instead via the admin combine tool.
 */
export function slugifyCuisine(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "_");
}

/**
 * The Maps link rendered on a place's page (CHANGES_20260814.md §2). With a
 * resolved `google_place_id` (migration 049), this opens the restaurant's
 * actual listing — name, photos, reviews — rather than a bare pin; Google's
 * documented `query_place_id` pattern keeps `query` as a text fallback in
 * case the id ever stops resolving. Without one, it falls back to today's
 * coordinate-only link, unchanged.
 */
export function googleMapsPlaceUrl(place: {
  name: string;
  lat: number;
  lng: number;
  google_place_id?: string | null;
}): string {
  if (place.google_place_id) {
    return (
      `https://www.google.com/maps/search/?api=1` +
      `&query=${encodeURIComponent(place.name)}` +
      `&query_place_id=${encodeURIComponent(place.google_place_id)}`
    );
  }
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}

/**
 * CHANGES_20260821b.md §1 — `socials_url` is stored as whatever full URL
 * was pasted, not normalized to one platform. Sniffing the domain at
 * display time is what lets one field cover Instagram, Facebook, or
 * anything else without a per-platform set of fields to fill in.
 */
/** Rejects anything that isn't a plain http(s) link — `socials_url` ends up
 *  rendered as a real `href`, so a `javascript:`/`data:` value pasted in
 *  (accidentally or not) should never make it past validation. */
export function isHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

export type SocialsHost = "instagram" | "facebook" | "other";

export function socialsHost(url: string): SocialsHost {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "instagram.com") return "instagram";
    if (hostname === "facebook.com") return "facebook";
  } catch {
    // Not a parseable URL — falls through to the generic label/icon.
  }
  return "other";
}

export function socialsLabel(url: string): string {
  switch (socialsHost(url)) {
    case "instagram":
      return "View on Instagram";
    case "facebook":
      return "View on Facebook";
    default:
      return "View socials";
  }
}

/**
 * The empty-state search-assist — Instagram-specific per CHANGES_20260821b.md
 * §1's decision, even though the field itself isn't locked to one platform:
 * Instagram is still the most likely place someone's actually looking one
 * up. Instagram's own keyword-search URL, not a third-party search engine —
 * there's no lookup-by-business-name API to call instead (see the doc's
 * citation trail), so this is a shortcut to look it up by hand, not a
 * resolution attempt.
 */
export function instagramSearchUrl(placeName: string): string {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(placeName)}`;
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
    timeZone: "Asia/Singapore",
  });
}

export function formatTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
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

/**
 * Resolves an instant onto Singapore's calendar day, independent of
 * whatever timezone the *runtime* evaluating it happens to be in — the
 * exact gap CHANGES_20260818.md §4 traced: Home's Server Component runs
 * during SSR on Vercel's UTC clock, not the visitor's phone, so any
 * "today"/"same day" comparison done with the runtime's own
 * `getFullYear()`/`getMonth()`/`getDate()` silently uses the server's
 * calendar day instead. Singapore has no DST, so a fixed +8h shift is
 * exact, not an approximation.
 *
 * Canonical home for this and `isSameSgtDay` — originally added for the
 * §13 admin analytics dashboard (`adminAnalytics.ts`, which re-exports both
 * for its existing callers), moved here now that a core page needs it too.
 */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO "YYYY-MM-DD" for the Asia/Singapore calendar day a timestamp falls on. */
export function sgtDateKey(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(d.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:MM" for the Asia/Singapore wall-clock time a timestamp falls on —
 *  the read-side counterpart of the `${date}T${time}+08:00` construction
 *  used wherever a wall-clock time gets turned into a real instant
 *  (recurring series, `confirmEventDate`). */
export function sgtTimeOfDay(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(d.getTime() + SGT_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * Right now, expressed as calendar components in Singapore's fixed UTC+8
 * offset — safe to feed into anything that reads a Date's *local* getters
 * (`nextOccurrence`, `dateKey`), regardless of what timezone the runtime
 * itself happens to be in. Recurring-series generation
 * (`generateDueOccurrences`) is the reason this exists: `new Date()` plus
 * local getters silently used the server's own calendar day during the
 * ~8-hour window where it doesn't match Singapore's — CHANGES_20260819b.md
 * §2, the write-side counterpart to CHANGES_20260818.md §4's display-only
 * version of the same class of bug.
 */
export function sgtToday(): Date {
  const [y, m, d] = sgtDateKey(new Date()).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** True when `iso` falls on the same Asia/Singapore calendar day as `reference`. */
export function isSameSgtDay(iso: string | Date, reference: Date): boolean {
  return sgtDateKey(iso) === sgtDateKey(reference);
}

/** Relative day label used in event lists. */
export function relativeDayLabel(input: string | Date, now = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const diffDays = Math.round(
    (Date.parse(sgtDateKey(d)) - Date.parse(sgtDateKey(now))) / 86400000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("en-SG", { weekday: "long", timeZone: "Asia/Singapore" });
  }
  return formatDate(d);
}

/**
 * The next date on or after `today` that falls on `weekday`
 * (0 = Sunday .. 6 = Saturday, matching `Date#getDay()`). Returns `today`
 * itself when `today` already matches. Used by recurring series generation —
 * see 031_recurring_series.sql.
 */
export function nextOccurrence(weekday: number, today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** "YYYY-MM-DD" in local time, for comparing against a stored date column. */
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
