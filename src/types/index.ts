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

/**
 * 1 = under $8, 2 = $8-15, 3 = $15-30, 4 = $30-50, 5 = $50-100, 6 = over
 * $100. The top band used to be a single "over $30" tier — split into
 * three (CHANGES_20260821.md §1) since it was too coarse.
 */
export type BudgetTier = 1 | 2 | 3 | 4 | 5 | 6;

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
  /**
   * Free-text tags typed through the "Other" chip. Display-only — shown
   * alongside `cuisine` on the card, but never read by recommendConfig.ts /
   * recommend.ts, so a junk tag can't quietly nudge rankings.
   */
  custom_cuisine_tags: string[];
  budget_tier: BudgetTier;
  osm_id?: number | null;
  source: PlaceSource;
  status: PlaceStatus;
  best_dishes: string[];
  notes?: string | null;
  /**
   * CHANGES_20260821b.md §1 — an optional link to the place's Instagram,
   * Facebook, or anything else, stored as the full URL exactly as pasted
   * rather than normalized to one platform's handle format. Freely editable
   * by anyone who can edit the place at all, same class as `notes` — not
   * system-resolved (no third-party API exists to look one up by business
   * name the way Google Places resolution does), so this is manual-only.
   */
  socials_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  /**
   * Google's own Place ID for this listing, resolved best-effort at create/
   * edit time by `src/lib/googlePlaces.ts` (CHANGES_20260814.md §2,
   * migration 049) — `null` until a confident match is found, or if Google
   * Places credentials aren't configured. System-computed, same class as
   * `avg_rating`: a plain edit cannot set this directly (027/049's grant
   * exclusion) — only `set_google_place_id` (SECURITY DEFINER) can.
   */
  google_place_id?: string | null;

  /** Derived, not stored: minutes on foot from the active office. */
  walk_minutes?: number | null;
  /** Derived, not stored: metres from the active office. */
  distance_m?: number | null;
  /** Derived, not stored: mean of all ratings across visits. */
  avg_rating?: number | null;
  /** Derived, not stored: how many visits have been logged. */
  visit_count?: number;
  /** Trigger-maintained: true while at least one flag on this place is
   *  unresolved (022_place_flags.sql). Shows a "Reported" badge — the place
   *  stays fully active until an admin resolves it. */
  has_pending_flag?: boolean;
  /**
   * Derived, not stored, and only populated when `/places` is sorted by
   * "rated by your Kaki group" (§12f) — the mean rating among visits logged
   * by anyone in one of the requesting user's Kaki groups, themself
   * included. `null`/absent means nobody in the group has rated it, not a
   * rating of zero.
   */
  kaki_rating?: number | null;
}

/**
 * The subset of `Place` safe to show an anonymous visitor — CHANGES_20260812.md
 * §4. Deliberately excludes `notes`, `created_by`, and anything from `Visit`
 * (the named review list was only ever consented to be shared with the
 * team, not the public internet). `lat`/`lng` and `google_place_id` *are*
 * included (CHANGES_20260814.md §2, migrations 047/049) — every place here
 * is a restaurant or eatery already publicly discoverable on Google Maps
 * regardless, so neither the exact pin nor which Google listing it maps to
 * carries the same sensitivity as `notes`/`created_by`. `get_public_place()`
 * also only ever returns `status = 'active'` places, so this type carries no
 * `status` field at all — there is nothing to branch on.
 */
export interface PublicPlace {
  id: string;
  name: string;
  address: string | null;
  cuisine: string[];
  custom_cuisine_tags: string[];
  budget_tier: BudgetTier;
  best_dishes: string[];
  avg_rating: number | null;
  visit_count: number;
  lat: number;
  lng: number;
  /** Google's own Place ID for this listing, when a confident match was
   *  found (src/lib/googlePlaces.ts) — `null` means fall back to a
   *  coordinate-based Maps link, same shape as `Place.google_place_id`. */
  google_place_id: string | null;
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
  /** Trigger-maintained (048_review_likes.sql), like avg_rating on places. */
  like_count: number;
  /** Throttle state for the like-triggered push — see 048_review_likes.sql.
   *  Not meaningful to read outside `claimReviewLikePushWindow`. */
  last_like_push_at?: string | null;

  /** Derived, only populated on review listings. */
  display_name?: string;
  /** Derived, only populated on review listings. */
  place_name?: string;
  /** Derived, only populated when a viewer is known — "have I liked this." */
  liked_by_me?: boolean;
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
  /**
   * CHANGES_20260821c.md §1 — the default for the "starting soon" reminder
   * below, distinct from `notify_events` (the master push on/off on
   * `profiles`): this is specifically whether *this* reminder type fires at
   * all, on top of whichever push types the master toggle already allows.
   */
  reminders_enabled: boolean;
  /** Default lead time in minutes, overridable per-Jio (see
   *  `EventReminderState`). */
  reminder_lead_minutes: number;
  /**
   * Which reference point Places/Map/a Jio's place-search compute walking
   * distance from. 'home'/'hangout' each carry their own supporting data
   * below, enforced present at write time (see the `/api/user-prefs`
   * route) so every read site can trust this field alone. Staged behind
   * an admin-only gate for now — see that same route.
   */
  location_mode: "office" | "home" | "hangout";
  /** Private, always — never exposed to anyone but the owner. Display
   *  only; distance math uses `home_lat`/`home_lng`. */
  home_address?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
  /** Which `HangoutZone` is active when `location_mode === "hangout"`. */
  active_hangout_zone_id?: string | null;
}

/**
 * A public, informal reference point — a church, a mall, wherever a
 * specific friend group actually meets — functionally a lightweight
 * cousin of `Office`, but anyone can add or edit one (same open norm as
 * `Place`), not just an admin. What makes it work as "a mini office
 * where everyone's the same place": any account can select any zone as
 * their active `location_mode`, no invite or membership needed.
 */
export interface HangoutZone {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  created_by: string;
  created_at?: string;
}

/**
 * CHANGES_20260821c.md §1 — one row per (event, confirmed-going user),
 * since a single event-level flag (the existing `reminder_sent_at`/
 * `claim_event_reminder` non-responder nudge) can't hold a per-person lead
 * time or a per-person sent flag. `lead_minutes` null means "use my
 * `user_prefs.reminder_lead_minutes` default"; set is a per-Jio override.
 * `sent_at` null means not yet fired — same one-shot idea as the existing
 * reminder's own column, just scoped per person instead of per event.
 */
export interface EventReminderState {
  event_id: string;
  user_id: string;
  lead_minutes: number | null;
  sent_at: string | null;
}

export interface Profile {
  user_id: string;
  display_name: string;
  created_at?: string;
  /** Null until the one-time /welcome screen has been completed. */
  onboarded_at?: string | null;
  /** One toggle covering every Jio-lifecycle push (§6) — invited, decided,
   *  and anything added later. `notify_lobangs` exists in the schema
   *  (migration 025) but has no UI or trigger yet; out of scope for §6. */
  notify_events?: boolean;
  /**
   * CHANGES_20260821_combined2.md §3D — set the first time this account
   * ever loads a decided Jio's page having both RSVP'd (any response) and
   * voted on it. Null forever after means "never fires again," same
   * one-shot shape as `onboarded_at`.
   */
  first_decided_celebration_shown_at?: string | null;
}

/** What a browser hands back from `PushManager.subscribe()`, trimmed to
 *  what the server needs to send to it later. */
export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

/** A stored subscription, resolved back to whichever user it belongs to —
 *  what `getPushTargets` returns for the send path. */
export interface PushTarget extends PushSubscriptionInput {
  userId: string;
}

export interface TeamUser {
  user_id: string;
  display_name: string;
}

/** One group of likely-duplicate accounts — same display name, different
 *  `auth.uid()`s — CHANGES_20260807.md §1a/§5. Only groups of 2+ are ever
 *  returned; a name nobody shares isn't a candidate. */
export interface DuplicateProfileGroup {
  normalized_name: string;
  accounts: Array<{
    user_id: string;
    display_name: string;
    created_at?: string;
  }>;
}

/** Row counts per table for one account, shown before an account merge
 *  commits — §5's "preview what will move" requirement. */
export interface AccountMergePreview {
  user_id: string;
  display_name: string;
  counts: Record<string, number>;
}

/**
 * What `/u/[token]` resolves a personal invite link to — CHANGES_20260818.md
 * §3 / docs/user-discovery.md §4.3. Deliberately minimal, same "return the
 * minimum field set" rule (§6 of that doc) as `PublicPlace`/`PublicLobang`:
 * just enough to render the profile card and drive "Start a Jio with them"
 * / "Add them to a Kaki" — never email, office, or anything else.
 */
export interface PersonalInvite {
  user_id: string;
  display_name: string;
}

/**
 * A cuisine everyone can use — CHANGES_20260818.md §6. Replaces the old
 * hardcoded `Cuisine` TS union, which could never grow past its 18
 * compile-time values; this is the runtime-extensible list it grows into.
 * `slug` is what's actually stored on `places.cuisine`/
 * `user_prefs.cuisine_likes`/`cuisine_dislikes` (all plain `string[]`, never
 * restricted to this list at the database level); `label` is what was
 * actually typed, kept for the admin combine tool's own readability —
 * every UI chip still runs a slug through `formatCuisine()` for display,
 * same as any other cuisine slug already does.
 */
export interface CuisineOption {
  slug: string;
  label: string;
  added_by?: string | null;
  created_at?: string;
}

/** Places + profile-preference reference counts for one candidate cuisine
 *  slug, shown before an admin combine commits — same "preview what will
 *  move" shape as `AccountMergePreview`. */
export interface CuisineMergePreview {
  slug: string;
  label: string;
  place_count: number;
  profile_count: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Null/undefined means "not a Flexi Jio" — every regular fixed-date event. */
export type DatePhase = "polling" | "confirmed";

export interface LunchEvent {
  id: string;
  office_id: string;
  host_id: string;
  title: string;
  /** For a polling Flexi Jio, a provisional value (the earliest candidate
   *  date) rather than a real commitment — check `date_phase` first. */
  scheduled_at: string;
  status: EventStatus;
  invite_token: string;
  winner_place_id?: string | null;
  kaki_id?: string | null;
  date_phase?: DatePhase | null;
  /** Set when this occurrence was generated by a recurring series. */
  recurring_series_id?: string | null;
  /**
   * Set only at creation, never editable after — a host-write-only setting,
   * not a `status`-class field. While `true` and `status === "open"`, every
   * API route redacts `votes`/`tally` from its response (see
   * `redactHiddenVotes` in `lib/voting.ts`); once closed, hidden votes reveal
   * like any other Jio.
   */
  hide_votes?: boolean;
  /** Set once, when `closeEvent` runs — powers §13b's time-to-decision
   *  metric. `null`/absent for anything still open or cancelled. */
  closed_at?: string | null;
  /** Throttle state for the "someone voted" push — see 038_vote_push_throttle.sql.
   *  Not meaningful to read outside `claimVotePushWindow`. */
  last_vote_push_at?: string | null;
  /** Set once the "starting soon" reminder has fired — see
   *  039_close_reminder.sql. Not meaningful to read outside `remindDueEvents`. */
  reminder_sent_at?: string | null;
  created_at?: string;

  /** Derived. */
  host_name?: string;
  /** Derived. */
  option_count?: number;
  /** Derived. */
  going_count?: number;
  /** Derived. */
  winner_place_name?: string | null;
  /**
   * Derived. Set only when the winner is a free-text option with no place
   * record behind it — the label to show in place of `winner_place_name`.
   */
  winner_label?: string | null;
  /**
   * Derived, event-detail fetches only (not the list view). The full record
   * behind `winner_place_id`, so the Decided banner can link to it and build
   * a Google Maps link — CHANGES_20260819c.md §4. A host-corrected winner
   * (`editEventWinner`) isn't necessarily one of `options`, so this can't be
   * assumed to already be sitting in the options list.
   */
  winner_place?: Place | null;
  /** Derived. Only meaningful for a polling Flexi Jio — has the requesting
   *  user already marked any availability on it? Powers the home page's
   *  "Needs your availability" list without a full per-event fetch. */
  has_marked_availability?: boolean;
}

export type RecurringSeriesMode = "vote" | "fixed";
export type RecurringSeriesStatus = "active" | "cancelled";

/**
 * A standing weekly Jio — CHANGES_20260801.md §10 ("Recurring Jios —
 * extended"). This is a generator, not an event: `generateDueOccurrences`
 * turns it into an ordinary `LunchEvent` each week, which is where all the
 * normal voting/RSVP/close machinery actually lives.
 */
export interface RecurringSeries {
  id: string;
  host_id: string;
  title: string;
  office_id?: string | null;
  kaki_id?: string | null;
  invitee_ids: string[];
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  /** "HH:MM", 24-hour. */
  time_of_day: string;
  mode: RecurringSeriesMode;
  /** Set only when `mode` is "fixed". */
  fixed_place_id?: string | null;
  /** Set only when `mode` is "vote" — seeded into every occurrence. */
  option_place_ids: string[];
  status: RecurringSeriesStatus;
  /** ISO date ("YYYY-MM-DD") of the most recently generated occurrence. */
  last_generated_date?: string | null;
  created_at?: string;

  /** Derived. */
  fixed_place_name?: string | null;
}

export interface EventCandidateDate {
  event_id: string;
  /** ISO date, "YYYY-MM-DD" — day-level, no time component. */
  date: string;
  added_by: string;
  created_at?: string;

  /** Derived. */
  added_by_name?: string;
}

/** One user marking themselves free on one candidate date. */
export interface EventDateVote {
  event_id: string;
  user_id: string;
  date: string;
  created_at?: string;

  /** Derived. */
  display_name?: string;
}

export interface EventOption {
  event_id: string;
  /**
   * Always set — never truly null. For a free-text option (see `label`)
   * this is a generated id with no matching row in `places`, not a
   * placeholder; it's what makes the option votable through the exact same
   * `event_votes.place_id` column real places use, with no schema fork.
   */
  place_id: string;
  added_by: string;
  /** True for a "Can't decide? Suggest 3" pick, false for a manual add. */
  is_suggested: boolean;
  /**
   * Set only for a free-text option added when a search had no results —
   * "vote first, prompt after" (see CHANGES_20260801.md §8). `place` will be
   * undefined whenever this is set. Cleared if the option is later attached
   * to a real place via `attachPlaceToOption`.
   */
  label?: string | null;

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
  /** Live Borda tally, keyed by place id. Redacted to `{}` while hidden. */
  tally?: Record<string, number>;
  /**
   * Count of distinct voters — always populated by every route, so the
   * client never has to fall back to counting `votes` itself, which is
   * empty while a hidden-vote Jio's standing is redacted.
   */
  voter_count?: number;
  /** Only meaningful for a Flexi Jio (`date_phase` set). */
  candidateDates: EventCandidateDate[];
  /** Only meaningful for a Flexi Jio (`date_phase` set). */
  dateVotes: EventDateVote[];
}

/**
 * CHANGES_20260821_combined2.md §3A — the narrow, privacy-safe shape a
 * signed-out visitor sees at `/e/[token]` before the signup wall, same
 * "unguessable token, SECURITY DEFINER resolver, narrow column list" shape
 * as `PublicPlace`/`get_public_place`. Deliberately excludes anything a
 * teammate's own vote or identity could leak through: no `tally`, no
 * `votes`, no `invitees`, no per-person RSVP list, no option-level vote
 * counts or `added_by`. `goingCount` is a rough headline number (RSVP'd
 * "yes"), not a roster.
 */
export interface PublicEventPreview {
  title: string;
  hostName: string;
  scheduledAt: string;
  datePhase: DatePhase | null;
  status: EventStatus;
  goingCount: number;
  placeOptions: { id: string; name: string }[];
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

/**
 * A "lobang" — Singlish for a tip-off — is a personalized place
 * recommendation one teammate sends directly to another (or to every member
 * of a Kaki at once — see `kaki_id`), never a broadcast to the whole team.
 *
 * Recipients live in a separate `lobang_recipients` table (snapshotted at
 * send time), so this object's shape depends on which `Repo` method produced
 * it: `listLobangsReceived` hydrates it for one specific recipient's view
 * (`to_user_id`/`seen_at` are that viewer's own); `listLobangsSent` hydrates
 * it as the send itself (`to_display_name` summarizes every recipient, or
 * names the Kaki for a group send).
 */
export interface Lobang {
  id: string;
  from_user_id: string;
  place_id: string;
  note?: string | null;
  /** The past Jio this was sent from, if any. Purely informational. */
  event_id?: string | null;
  /** Set only for a group send. Display provenance only — the actual
   *  recipient list always lives in `lobang_recipients`. */
  kaki_id?: string | null;
  /**
   * Set only for a public send (CHANGES_20260816.md §4) — an unguessable
   * token `/l/[token]` resolves through `get_public_lobang()`, same
   * SECURITY DEFINER shape as `get_public_place`. No `lobang_recipients`
   * rows exist for a public send (there's no specific person), so this is
   * how one is told apart from a targeted send: `listLobangsSent`/
   * `listLobangsReceived` both exclude rows where this is set.
   */
  public_token?: string | null;
  created_at?: string;

  /** Derived. Populated only on a `listLobangsReceived` row, or a
   *  single-recipient `listLobangsSent` row. */
  to_user_id?: string;
  /** Derived. Null until that recipient has seen it. */
  seen_at?: string | null;

  /** Derived. */
  from_display_name?: string;
  /** Derived. Who/what this went to, as one string — a teammate's name for
   *  an individual send, or the Kaki's name for a group send. */
  to_display_name?: string;
  /** Derived. */
  place?: Place;
  /** Derived. */
  event_title?: string | null;
}

/**
 * Who a lobang is being sent to — specific teammates, a whole Kaki, or
 * `"public"` (CHANGES_20260816.md §4) for a link anyone can open, signed
 * in or not, with no `lobang_recipients` fan-out at all.
 */
export type LobangTarget =
  | { type: "users"; userIds: string[] }
  | { type: "kaki"; kakiId: string }
  | { type: "public" };

/**
 * The subset of a public lobang send safe to show an anonymous visitor —
 * CHANGES_20260816.md §4, the same "unguessable token, SECURITY DEFINER
 * resolver, narrow column list" shape as `PublicPlace`/`get_public_place`.
 * `from_display_name` is safe to show precisely because it's resolved
 * server-side from the token, not read from anything the visitor's own
 * browser supplied — never a client-editable URL parameter claiming to be
 * from someone.
 */
export interface PublicLobang {
  place: PublicPlace;
  from_display_name: string;
  note: string | null;
  created_at: string;
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

// ---------------------------------------------------------------------------
// Place flags
// ---------------------------------------------------------------------------

export type FlagReason =
  | "closed"
  | "wrong_info"
  | "duplicate"
  | "inappropriate"
  | "other";

/** "blocked" means an admin resolved the flag(s) by blocking the place —
 *  reuses the same status/log an ordinary block_place() call would. */
export type FlagResolution = "dismissed" | "edited" | "blocked";

export interface PlaceFlag {
  id: string;
  place_id: string;
  flagged_by: string;
  reason: FlagReason;
  comment?: string | null;
  status: "pending" | "resolved";
  resolution?: FlagResolution | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at?: string;

  /** Derived. */
  place_name?: string;
  /** Derived. */
  flagged_by_name?: string;
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
  /**
   * Overrides `officeId` when set — the caller's own Home or Hangout Zone
   * coordinates, resolved by the API route from their `user_prefs`
   * (never a client-supplied value). Skips `walk_cache` entirely in favor
   * of a haversine estimate; see `enrich()`/`walkTimes()`.
   */
  activeLocation?: { lat: number; lng: number } | null;
  /**
   * Defaults to "walk" (nearest first) when omitted. "kaki_rating" is
   * handled entirely at the API route layer (see §12f in
   * src/app/api/places/route.ts) — the repo has no concept of "the
   * requesting user's Kaki groups," so it's never passed down here.
   */
  sortBy?: "walk" | "rating";
}

export interface PlacesPagination {
  limit: number;
  offset: number;
}

export interface PlacesPage {
  places: Place[];
  /** Total matching rows, ignoring `limit`/`offset` — for a "Load more" count. */
  total: number;
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

/**
 * CHANGES_20260821_combined2.md Item 1 — rule-based "food identity" cards,
 * derived from `UserMetrics`/`KakiMetrics` rather than anything trained.
 * See `src/lib/foodIdentity.ts` for the exact thresholds and priority
 * order.
 */
export type FoodArchetype =
  | "loyalist"
  | "explorer"
  | "regular"
  | "enthusiast"
  | "connoisseur"
  | "budget_hunter"
  | "well_rounded"
  | "just_getting_started";

export interface FoodIdentityCard {
  archetype: FoodArchetype;
  headline: string;
  description: string;
}

/** A locked snapshot of one month's `FoodIdentityCard` — see 068_food_identity_snapshots.sql. */
export interface UserFoodIdentitySnapshot extends FoodIdentityCard {
  /** "YYYY-MM". */
  month: string;
  computed_at: string;
}

/** Kaki-level card: a group vibe headline plus the two award slots,
 *  elevated from the plain stat tiles they replace. Positive-only by
 *  design — there is no "least adventurous" or equivalent negative slot. */
export interface KakiFoodIdentityCard {
  headline: string;
  description: string;
  mostActive: { user_id: string; visits: number } | null;
  adventurer: { user_id: string; distinctPlaces: number } | null;
}

export interface KakiFoodIdentitySnapshot extends KakiFoodIdentityCard {
  month: string;
  computed_at: string;
}

export interface CuisineStreak {
  cuisine: string;
  days: number;
}

/** One point in a day- or week-bucketed count series, Asia/Singapore day
 *  boundary per CHANGES_20260803_1.md §13c. `date` is the bucket start,
 *  ISO "YYYY-MM-DD". */
export interface DateCount {
  date: string;
  count: number;
}

export interface NamedCount {
  id: string;
  name: string;
  count: number;
}

/**
 * §13 admin analytics dashboard, Phase 1 (in-app). Covers a fixed 90-day
 * trailing window, no date-range picker in v1 (§13c). Two fields the spec
 * asked for aren't here because the schema doesn't carry the timestamp
 * they'd need yet — see the doc comments on those two entries below rather
 * than treating the gap as an oversight.
 */
export interface AdminAnalytics {
  windowDays: number;
  generatedAt: string;
  /** Part 1 §E — the segment (if any) `jioOutcomes`/`funnelSteps` are
   *  currently restricted to (Jios hosted by that segment's members).
   *  `null` means unfiltered, the normal case. */
  appliedSegment: AdminUserSegmentKey | null;

  funnel: {
    /** Today only (Asia/Singapore), not a window total — a funnel is a
     *  snapshot of "who did what today," not a 90-day sum. */
    participatingDau: number;
    /**
     * Lifetime total, not a daily figure — `event_rsvps` has no timestamp
     * column, so "responded today" isn't something the current schema can
     * answer. Worth adding `responded_at` if this funnel stays a priority.
     */
    respondedToInviteTotal: number;
    votedInJioToday: number;
    hostedJioToday: number;
  };

  growth: {
    newUsersPerDay: DateCount[];
    /** Part 1 §E — who actually joined each day, powering the "new users"
     *  sparkline's click-through. Sparse like `newUsersPerDay` itself: a
     *  day with no signups has no entry. */
    newUsersDetail: { date: string; users: { id: string; name: string }[] }[];
    jiosCreatedPerDay: DateCount[];
    /**
     * All places created, any path. The Growth table asked for a split
     * between "added via a Jio" and "added via /places/new" — both paths
     * insert through the same `places` row with no field distinguishing
     * how it got there, so that split isn't derivable from the current
     * schema without adding one.
     */
    placesAddedPerDay: DateCount[];
    kakiGroupsCreatedPerDay: DateCount[];
    kakiGroupsCumulative: number;
  };

  jioOutcomes: {
    decided: number;
    closedNoWinner: number;
    cancelled: number;
    stillOpen: number;
    avgBallotsPerJio: number;
    /** `null` when no Jio in the window has both `created_at` and
     *  `closed_at` to measure between. */
    medianTimeToDecisionHours: number | null;
  };

  content: {
    /** Floored to places with at least 3 visits, so one glowing review
     *  can't sit at the top of the list. */
    topRatedPlaces: (NamedCount & { avgRating: number })[];
    mostVisitedPlaces: NamedCount[];
    /** Named-category counts only — a custom "Other" tag is free text, not
     *  a category to break out individually. */
    cuisineDistribution: Record<string, number>;
    customCuisineTagUsageCount: number;
    walkTimeBuckets: { bucket: string; count: number }[];
  };

  social: {
    mostActiveKakis: NamedCount[];
    groupSizeDistribution: { size: number; count: number }[];
  };

  moderation: {
    reportsFiledPerWeek: DateCount[];
    reportsResolvedPerWeek: DateCount[];
    avgResolutionHours: number | null;
    pendingCount: number;
  };

  wishlist: {
    savesPerWeek: DateCount[];
    mostSavedPlaces: NamedCount[];
  };

  /**
   * In-app usage trend (CHANGES_20260821_combined.md Part 1 §F) — distinct
   * users per bucket across the same six "did anything" signals `funnel.
   * participatingDau` already uses for today, extended over the full
   * trailing window instead of just today. This is deliberately separate
   * from Vercel's page-view analytics (still linked from the Performance
   * view) — this is "how many people used the app," not "how many pages
   * were requested."
   */
  performance: {
    dauPerDay: DateCount[];
    wauPerWeek: DateCount[];
    mauPerMonth: DateCount[];
  };

  /**
   * The real step funnel (Part 1 §D) — replaces `funnel`'s four same-day
   * counts (never a true funnel: no shared population, no drop-off) with an
   * actual invited → responded → voted → attended → reviewed conversion
   * over every *decided* Jio (closed with a winner) in the window. A Jio
   * that never resolved has nothing to attend or review, so the population
   * is scoped to decided Jios only — unlike `funnel.participatingDau` above,
   * which counts any activity regardless of outcome.
   *
   * "Attended" = RSVP'd yes (decided in §2 of the source doc — the app's
   * own explicit signal, higher coverage than requiring a logged visit).
   * "Reviewed" is the one approximation the schema forces: `visits` has no
   * `event_id`, so it can't be tied to *which* Jio prompted it — this counts
   * a participant as reviewed if they logged any visit to the winning place
   * at or after the Jio's `closed_at`. A person who separately visits the
   * same place for an unrelated reason shortly after could be miscounted;
   * worth adding `visits.event_id` if this funnel becomes a priority.
   */
  funnelSteps: {
    steps: {
      step: "invited" | "responded" | "voted" | "attended" | "reviewed";
      count: number;
    }[];
    /** Each series bucketed by the *Jio's* creation week, so a trend reads
     *  "of the Jios created that week, how many invite-instances eventually
     *  reached this step" — not when the RSVP/vote/visit itself happened. */
    trend: {
      invitedPerWeek: DateCount[];
      respondedPerWeek: DateCount[];
      votedPerWeek: DateCount[];
      attendedPerWeek: DateCount[];
      reviewedPerWeek: DateCount[];
    };
    /** One row per Asia/Singapore week a participant signed up in, showing
     *  how that signup cohort converted across every decided Jio they were
     *  part of in the window — not just Jios created that week. */
    cohortBySignupWeek: {
      weekStart: string;
      invited: number;
      responded: number;
      voted: number;
      attended: number;
      reviewed: number;
    }[];
  };
}

/**
 * Part 1 §C — a single place's drill-down behind the Places view's
 * click-through (same pattern as the Users view's per-person drill-down).
 * `null` from `getAdminPlaceDetail` means the place id doesn't exist —
 * distinct from a real place with zero of everything.
 */
export interface AdminPlaceDetail {
  placeId: string;
  /** Everyone who's logged a visit here, ranked by visit count. */
  visitors: NamedCount[];
  /** Weekly average rating — a trend, not just `Place.avg_rating`'s single
   *  current number. Only weeks with at least one rated visit appear. */
  ratingTrend: { date: string; avgRating: number; count: number }[];
  wishlistSaveCount: number;
  /** How many `lobangs` (personal "you should try this" tip-offs) named
   *  this place, from anyone to anyone. */
  lobangMentionCount: number;
  /** % of this place's distinct visitors whose `cuisine_likes` overlaps the
   *  place's own cuisine tags. `null` when no visitor has any cuisine
   *  preference recorded to compare against — not the same as 0%. */
  cuisineAlignmentPct: number | null;
  /** % of this place's distinct visitors whose [budget_min, budget_max]
   *  range includes the place's `budget_tier`. `null` with zero visitors. */
  budgetAlignmentPct: number | null;
}

/**
 * Part 1 §B — per-activity-type weighting for the Users view's composite
 * engagement score. Equal (1) by default, but a real, persisted, admin-
 * editable setting (`admin_engagement_weights`, migration 064) rather than
 * a hardcoded constant — the source doc was explicit that "equal for now"
 * still needed its own small settings surface, since the next admin may
 * want to weight differently.
 */
export interface AdminEngagementWeights {
  hosted: number;
  voted: number;
  rsvp: number;
  visit: number;
  review: number;
  lobang: number;
  /** `null` if the weights have never been changed from their seeded
   *  default. */
  updatedAt: string | null;
}

/** One person's row in the Users view's leaderboard or a segment list —
 *  the composite score alongside every signal that fed it, so the number
 *  is never the only thing visible (per the source doc's §2 decision). */
export interface AdminUserSummary {
  id: string;
  name: string;
  score: number;
  hostedCount: number;
  votedCount: number;
  /** Lifetime, not windowed — `event_rsvps` has no timestamp column, the
   *  same schema gap as `funnel.respondedToInviteTotal`. */
  rsvpCount: number;
  visitCount: number;
  /** Visits with `is_public` set — a review, not just a private diary
   *  entry, distinct from `visitCount`. */
  reviewCount: number;
  lobangCount: number;
}

export type AdminUserSegmentKey =
  | "powerHosts"
  | "activeVoters"
  | "rsvpOnlyLurkers"
  | "reviewers"
  | "dormant"
  | "newAndActive";

/**
 * Part 1 §B's Users view. Rule-based segments, not ML/clustering — deemed
 * overkill for a small internal tool and worse than named, explainable
 * groups for Sean's stated use ("ask the person for their ideas"). A
 * person can land in more than one segment; these aren't partitions.
 */
export interface AdminUsersData {
  windowDays: number;
  weights: AdminEngagementWeights;
  /** Top scorers with a score above zero, ranked — everyone else still
   *  shows up in whichever segments they match, just not here. */
  leaderboard: AdminUserSummary[];
  segments: Record<AdminUserSegmentKey, AdminUserSummary[]>;
}

/**
 * Part 1 §B's per-person drill-down — reuses `computeUserMetrics` (already
 * storage-agnostic, never tied to "the logged-in user") pointed at one
 * target, plus admin-only context alongside it. `visits` here is every
 * visit regardless of `is_public` — a deliberate, documented privacy debt
 * (source doc §2): full detail for now, worth tightening to aggregate-only
 * once more admins are added, since the risk of exposure grows with the
 * admin list, not with this feature itself.
 */
export interface AdminUserDetail {
  userId: string;
  name: string;
  metrics: UserMetrics;
  hostedCount: number;
  kakiMemberships: { id: string; name: string }[];
  lobangsSent: number;
  lobangsReceived: number;
  /** `null` if this person has never done anything at all. */
  lastActiveAt: string | null;
  /** % of Jios this person was ever invited to (host, Kaki member, or
   *  explicit invitee) that they RSVP'd to at all, lifetime. `null` if
   *  they've never been invited to one. */
  rsvpResponsivenessPct: number | null;
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
