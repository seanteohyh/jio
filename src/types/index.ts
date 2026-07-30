/**
 * Shared domain types for Jio.
 *
 * These types are storage-agnostic on purpose: they describe the domain, not a
 * particular database. Any new `Repo` implementation (Postgres, Firebase,
 * SQLite, an HTTP backend) only has to produce and accept these shapes.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Cuisine =
  | "chinese"
  | "malay"
  | "indian"
  | "japanese"
  | "korean"
  | "thai"
  | "vietnamese"
  | "western"
  | "italian"
  | "local"
  | "halal"
  | "vegetarian"
  | "cafe"
  | "fast_food"
  | "food_court"
  | "dessert"
  | "other";

/** 1 = under $8, 2 = $8-15, 3 = $15-30, 4 = over $30. */
export type BudgetTier = 1 | 2 | 3 | 4;

export type PlaceSource = "osm_seed" | "manual" | "discovery";
export type PlaceStatus = "active" | "needs_review" | "blocked";
export type EventStatus = "open" | "closed" | "cancelled";
export type RsvpResponse = "yes" | "no" | "maybe";

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface Office {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  created_at?: string;
}

export interface Place {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  cuisine: string[];
  budget_tier: BudgetTier;
  osm_id?: number | null;
  source: PlaceSource;
  status: PlaceStatus;
  best_dishes: string[];
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;

  /** Derived, not stored: minutes on foot from the active office. */
  walk_minutes?: number | null;
  /** Derived, not stored: metres from the active office. */
  distance_m?: number | null;
  /** Derived, not stored: mean of all ratings across visits. */
  avg_rating?: number | null;
  /** Derived, not stored: how many visits have been logged. */
  visit_count?: number;
}

export interface Visit {
  id: string;
  place_id: string;
  user_id: string;
  rating: number;
  best_dishes: string[];
  notes?: string | null;
  visited_at: string;
  created_at?: string;
  is_public: boolean;

  /** Derived, only populated on review listings. */
  display_name?: string;
  /** Derived, only populated on review listings. */
  place_name?: string;
}

export interface WalkCacheEntry {
  office_id: string;
  place_id: string;
  walk_minutes: number;
  distance_m: number;
  computed_at?: string;
}

export interface UserPrefs {
  user_id: string;
  cuisine_likes: string[];
  cuisine_dislikes: string[];
  budget_min: BudgetTier;
  budget_max: BudgetTier;
  blocklist: string[];
  default_office_id?: string | null;
}

export interface Profile {
  user_id: string;
  display_name: string;
  created_at?: string;
}

export interface TeamUser {
  user_id: string;
  display_name: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface LunchEvent {
  id: string;
  office_id: string;
  host_id: string;
  title: string;
  scheduled_at: string;
  status: EventStatus;
  invite_token: string;
  winner_place_id?: string | null;
  kaki_id?: string | null;
  created_at?: string;

  /** Derived. */
  host_name?: string;
  /** Derived. */
  option_count?: number;
  /** Derived. */
  going_count?: number;
  /** Derived. */
  winner_place_name?: string | null;
}

export interface EventOption {
  event_id: string;
  place_id: string;
  added_by: string;

  /** Derived. */
  place?: Place;
  /** Derived. */
  added_by_name?: string;
}

export interface EventVote {
  event_id: string;
  user_id: string;
  place_id: string;
  rank: number;
  created_at?: string;
}

export interface EventRsvp {
  event_id: string;
  user_id: string;
  response: RsvpResponse;

  /** Derived. */
  display_name?: string;
}

export interface EventInvitee {
  event_id: string;
  user_id: string;

  /** Derived. */
  display_name?: string;
}

export interface EventDetail extends LunchEvent {
  options: EventOption[];
  votes: EventVote[];
  rsvps: EventRsvp[];
  invitees: EventInvitee[];
  /** Live Borda tally, keyed by place id. */
  tally?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Wishlist, recos, kakis
// ---------------------------------------------------------------------------

export interface WishlistEntry {
  user_id: string;
  place_id: string;
  created_at?: string;

  /** Derived. */
  place?: Place;
}

export interface Reco {
  id: string;
  place_id: string;
  user_id: string;
  comment?: string | null;
  created_at?: string;

  /** Derived. */
  display_name?: string;
  /** Derived. */
  place?: Place;
}

/**
 * A "lobang" — Singlish for a tip-off — is a personalized place
 * recommendation one teammate sends directly to another, as opposed to a
 * `Reco`, which is broadcast to everyone in the food pool.
 */
export interface Lobang {
  id: string;
  from_user_id: string;
  to_user_id: string;
  place_id: string;
  note?: string | null;
  /** The past Jio this was sent from, if any. Purely informational. */
  event_id?: string | null;
  created_at?: string;
  /** Null until the recipient has seen it. */
  seen_at?: string | null;

  /** Derived. */
  from_display_name?: string;
  /** Derived. */
  to_display_name?: string;
  /** Derived. */
  place?: Place;
  /** Derived. */
  event_title?: string | null;
}

/**
 * One block or unblock event. "Removing" a place always means flipping its
 * status, never deleting the row — this log is the trail of who did that,
 * when, and (for a block) why.
 */
export interface ModerationLogEntry {
  id: string;
  place_id: string;
  actor_id: string;
  action: "block" | "unblock";
  reason?: string | null;
  created_at?: string;

  /** Derived. */
  place_name?: string;
  actor_display_name?: string;
}

export interface Kaki {
  id: string;
  name: string;
  created_by: string;
  invite_token: string;
  created_at?: string;

  /** Derived. */
  member_count?: number;
}

export interface KakiMember {
  kaki_id: string;
  user_id: string;
  joined_at?: string;

  /** Derived. */
  display_name?: string;
}

export interface KakiDetail extends Kaki {
  members: KakiMember[];
}

// ---------------------------------------------------------------------------
// Recommendation engine
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  cuisineAffinity: number;
  bayesianRating: number;
  budgetFit: number;
  walkPenalty: number;
  varietyBonus: number;
  wishlistBoost: number;
  recoBoost: number;
}

export interface ScoredPlace {
  place: Place;
  score: number;
  breakdown: ScoreBreakdown;
  /** The single component that contributed most to the score. */
  topReason: keyof ScoreBreakdown;
}

export interface RankOptions {
  /** Multiplier applied to the walk penalty. 2 when rain is likely. */
  weatherMultiplier?: number;
  /** Place ids recommended by teammates. */
  recoPlaceIds?: string[];
  /** Injected clock, for deterministic tests. */
  now?: Date;
  /** Cap on how many results to return. */
  limit?: number;
  /** Restrict to these cuisines. */
  cuisines?: string[];
  /** Cap on walking minutes. */
  maxWalkMinutes?: number;
}

export interface MemberData {
  userId: string;
  visits: Visit[];
  prefs: UserPrefs | null;
  wishlistPlaceIds: string[];
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface Filters {
  cuisines: string[];
  budgetMin: BudgetTier;
  budgetMax: BudgetTier;
  maxWalkMinutes: number;
  status: PlaceStatus | "all";
  search: string;
  officeId: string;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface FavouritePlace {
  place_id: string;
  place_name: string;
  visit_count: number;
  avg_rating: number;
}

export interface UserMetrics {
  totalVisits: number;
  distinctPlaces: number;
  favouritePlaces: FavouritePlace[];
  avgRatingGiven: number;
  cuisineBreakdown: Record<string, number>;
  avgBudgetTier: number;
  avgBudgetLabel: string;
  mostActiveMonth: string | null;
  currentVariety: number;
}

export interface KakiMetrics {
  groupTotalVisits: number;
  groupDistinctPlaces: number;
  groupFavouritePlaces: FavouritePlace[];
  groupAvgBudgetTier: number;
  groupAvgBudgetLabel: string;
  groupCuisineBreakdown: Record<string, number>;
  mostActiveMember: { user_id: string; visits: number } | null;
  adventurer: { user_id: string; distinctPlaces: number } | null;
}

export interface CuisineStreak {
  cuisine: string;
  days: number;
}

// ---------------------------------------------------------------------------
// External services
// ---------------------------------------------------------------------------

export interface WalkingRoute {
  distance_m: number;
  walk_minutes: number;
  /** Decoded [lat, lng] pairs, when the provider returns geometry. */
  polyline?: [number, number][];
  /** Which provider produced this result. */
  source: "onemap" | "haversine";
}

export interface WeatherForecast {
  area: string;
  forecast: string;
  validity: string;
  rainLikely: boolean;
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface PlaceCandidate {
  name: string;
  lat: number;
  lng: number;
  cuisine: string[];
  budget_tier: BudgetTier;
  osm_id: number;
  source: PlaceSource;
  status: PlaceStatus;
  address?: string | null;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string | null;
  display_name?: string | null;
}
