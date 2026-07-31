import type {
  EventDetail,
  EventOption,
  Filters,
  FlagReason,
  FlagResolution,
  Kaki,
  KakiDetail,
  Lobang,
  LobangTarget,
  LunchEvent,
  ModerationLogEntry,
  Office,
  Place,
  PlaceFlag,
  PlacesPage,
  PlacesPagination,
  Profile,
  RsvpResponse,
  ScoredPlace,
  TeamUser,
  UserPrefs,
  Visit,
  WalkCacheEntry,
  WishlistEntry,
} from "@/types";

/**
 * The single seam between Jio and whatever stores its data.
 *
 * Pages and API routes call these methods and nothing else — no page imports
 * a Supabase client, writes SQL, or knows what a row looks like. Porting the
 * app to a different database means writing one new file that satisfies this
 * interface and adding a line to `repo.ts`.
 *
 * `tests/repoConformance.test.ts` asserts that every implementation exposes
 * the same method set with the same arity, so a partial port fails loudly.
 */
export interface Repo {
  // ---- Places ----
  /**
   * Sorted nearest-first by default (see `sortPlacesForList`). Omit
   * `pagination` for the full unpaginated list — `/suggest` and `/map` both
   * do this deliberately, since ranking/mapping need every eligible place.
   * Pass it (the plain `/places` browse list does) to page 15 at a time via
   * "Load more"; `total` ignores `limit`/`offset` so the UI knows whether
   * more is left to load.
   */
  listPlaces(
    filters?: Partial<Filters>,
    pagination?: PlacesPagination
  ): Promise<PlacesPage>;
  getPlace(id: string): Promise<Place | null>;
  createPlace(
    data: Omit<Place, "id" | "created_at" | "updated_at">
  ): Promise<Place>;
  updatePlace(id: string, data: Partial<Place>): Promise<Place>;
  deletePlace(id: string): Promise<void>;

  // ---- Visits & reviews ----
  listVisits(placeId?: string, userId?: string): Promise<Visit[]>;
  createVisit(data: Omit<Visit, "id" | "created_at">): Promise<Visit>;

  /**
   * Amend one of your own visits.
   *
   * `userId` is passed and checked in the implementation as well as being
   * enforced by the `visits_update` RLS policy. Belt and braces on purpose:
   * demoRepo has no RLS to lean on, and a silent no-op in demo mode that
   * becomes a refusal in production is a difference worth not having.
   *
   * Changing `rating` re-fires migration 021's trigger, so `places.avg_rating`
   * and `visit_count` stay correct with nothing extra to call here.
   */
  updateVisit(
    id: string,
    userId: string,
    patch: Partial<
      Pick<Visit, "rating" | "best_dishes" | "notes" | "visited_at" | "is_public">
    >
  ): Promise<Visit>;

  /** Remove one of your own visits. Same ownership rule as `updateVisit`. */
  deleteVisit(id: string, userId: string): Promise<void>;

  listPublicReviews(placeId: string): Promise<Visit[]>;

  // ---- Walk cache & offices ----
  getWalkCache(officeId: string): Promise<WalkCacheEntry[]>;
  upsertWalkCache(entries: WalkCacheEntry[]): Promise<void>;
  listOffices(): Promise<Office[]>;
  createOffice(data: Omit<Office, "id" | "created_at">): Promise<Office>;

  // ---- User preferences ----
  getUserPrefs(userId: string): Promise<UserPrefs | null>;
  upsertUserPrefs(prefs: UserPrefs): Promise<UserPrefs>;

  // ---- Profiles ----
  getProfile(userId: string): Promise<Profile | null>;
  upsertProfile(userId: string, displayName: string): Promise<Profile>;
  getDisplayNames(userIds: string[]): Promise<Map<string, string>>;
  listAllUsers(): Promise<TeamUser[]>;
  /**
   * Completes the one-time /welcome screen: sets the display name and stamps
   * `onboarded_at`, atomically. Distinct from `upsertProfile` (used for a
   * later rename on /profile), which never touches `onboarded_at`.
   */
  completeOnboarding(userId: string, displayName: string): Promise<Profile>;

  // ---- Lunch events ----
  createEvent(
    hostId: string,
    title: string,
    scheduledAt: string,
    officeId: string,
    placeIds: string[],
    kakiId?: string | null,
    inviteeIds?: string[]
  ): Promise<LunchEvent>;
  /**
   * A Flexi Jio: date_phase starts 'polling' rather than skipping straight
   * to place voting. `candidateDates` needs at least 2 entries (enforced
   * here). `scheduled_at` is seeded to the earliest of them as a
   * provisional value — see the `LunchEvent.scheduled_at` doc comment.
   */
  createFlexiEvent(
    hostId: string,
    title: string,
    officeId: string,
    candidateDates: string[],
    kakiId?: string | null,
    inviteeIds?: string[]
  ): Promise<LunchEvent>;
  getEvent(idOrToken: string): Promise<EventDetail | null>;
  listEvents(userId: string): Promise<LunchEvent[]>;
  /**
   * Adds another candidate date to an already-polling Flexi Jio. Same
   * authorization as `addOptionToEvent`, mirrored on purpose rather than
   * inventing a new rule.
   */
  addCandidateDate(eventId: string, date: string, userId: string): Promise<void>;
  /**
   * Marks which candidate dates `userId` is free on. Fully replaces their
   * prior selection — this is presence, not an additive vote — so marking
   * `[]` clears it.
   */
  markDateAvailability(
    eventId: string,
    userId: string,
    dates: string[]
  ): Promise<void>;
  /**
   * Host confirms one candidate date, moving `date_phase` from 'polling' to
   * 'confirmed' and setting `scheduled_at` for real. The host may pick any
   * candidate date, not just the most-available one — the UI pre-highlights
   * the leader, the same "suggest, don't force" spirit as the roulette
   * override on a regular Jio's close step.
   */
  confirmEventDate(
    eventId: string,
    hostId: string,
    date: string
  ): Promise<LunchEvent>;
  addInviteesToEvent(
    eventId: string,
    userIds: string[],
    hostId: string
  ): Promise<void>;
  addOptionToEvent(
    eventId: string,
    placeId: string,
    userId: string
  ): Promise<void>;
  removeOptionFromEvent(
    eventId: string,
    placeId: string,
    userId: string
  ): Promise<void>;
  /**
   * "Can't decide? Suggest 3" — 2 personalized picks (scored against
   * invitees who've RSVP'd yes/maybe, falling back to every invitee if
   * nobody's responded) plus 1 exploratory pick (novel to this specific
   * group). Same authorization as `addOptionToEvent`. First removes any
   * earlier suggested option on this event that hasn't received a vote yet
   * (a re-roll replaces the untouched ones; anything already voted on
   * stays), then adds the fresh picks, marked `is_suggested`.
   * `excludePlaceIds` additionally rules out places suggested earlier in the
   * same client session, so a re-roll doesn't repeat itself.
   */
  suggestOptionsForEvent(
    eventId: string,
    userId: string,
    excludePlaceIds?: string[]
  ): Promise<EventOption[]>;
  castBallot(
    eventId: string,
    userId: string,
    rankedPlaceIds: string[]
  ): Promise<void>;
  rsvp(
    eventId: string,
    userId: string,
    response: RsvpResponse
  ): Promise<void>;
  closeEvent(
    eventId: string,
    hostId: string,
    winnerPlaceId?: string | null
  ): Promise<EventDetail>;

  // ---- Wishlist ----
  listWishlist(userId: string): Promise<WishlistEntry[]>;
  toggleWishlist(
    userId: string,
    placeId: string
  ): Promise<{ added: boolean }>;

  // ---- Kakis (lunch groups) ----
  createKaki(userId: string, name: string): Promise<Kaki>;
  getKaki(idOrToken: string): Promise<KakiDetail | null>;
  listKakis(userId: string): Promise<Kaki[]>;
  joinKaki(token: string, userId: string): Promise<Kaki>;
  leaveKaki(kakiId: string, userId: string): Promise<void>;

  // ---- Lobangs (personalized tip-offs sent to a teammate or a Kaki) ----
  /**
   * Sends a lobang to either a list of specific teammates or every current
   * member of a Kaki (snapshotted into `lobang_recipients` at send time —
   * a later membership change never alters who a past lobang went to).
   * The sender is always excluded from the recipient list, even if they are
   * a member of the target Kaki. A `{ type: "kaki" }` target is rejected
   * unless `fromUserId` is currently a member of that Kaki. Throws if the
   * resulting recipient list is empty.
   */
  sendLobang(
    fromUserId: string,
    target: LobangTarget,
    placeId: string,
    note?: string | null,
    eventId?: string | null
  ): Promise<Lobang>;
  listLobangsReceived(userId: string, limit?: number): Promise<Lobang[]>;
  listLobangsSent(userId: string, limit?: number): Promise<Lobang[]>;
  markLobangSeen(userId: string, lobangId: string): Promise<void>;
  dismissLobang(userId: string, lobangId: string): Promise<void>;
  /**
   * Places ranked for `toUserId`, computed from signals the caller is
   * already allowed to see under RLS (the target's *public* visits) — never
   * their private prefs or private visits.
   */
  suggestPlacesForFriend(
    toUserId: string,
    limit?: number
  ): Promise<ScoredPlace[]>;

  // ---- Admin & moderation ----
  /** Whether `userId` is on the admin allowlist. Never self-service. */
  isAdmin(userId: string): Promise<boolean>;
  /**
   * Sets a place's status to `blocked`. Only the place's own creator or an
   * admin may do this — enforced here (RLS/a SECURITY DEFINER function in
   * live mode), not just in the UI. Throws if `reason` is blank.
   */
  blockPlace(userId: string, placeId: string, reason: string): Promise<Place>;
  /** Sets a place's status back to `active`. Admin only. */
  unblockPlace(userId: string, placeId: string): Promise<Place>;
  /** Full block/unblock history, newest first, hydrated for the moderation view. */
  listModerationLog(limit?: number): Promise<ModerationLogEntry[]>;
  /**
   * Confirms or dismisses a freshly-discovered (`needs_review`) place. Any
   * signed-in user may call this — it's crowd-confirmation of OSM data
   * quality, not moderation of an established place, so unlike `blockPlace`
   * it needs no reason and unlike `unblockPlace` it needs no admin check.
   * Throws if the place isn't currently `needs_review`.
   */
  reviewPlace(userId: string, placeId: string, approve: boolean): Promise<Place>;

  // ---- Place flags ----
  /** Any signed-in user can flag a place — always lands pending. */
  flagPlace(
    userId: string,
    placeId: string,
    reason: FlagReason,
    comment?: string | null
  ): Promise<PlaceFlag>;
  /** The flagger's own reports, newest first — "My Reports". */
  listMyFlags(userId: string): Promise<PlaceFlag[]>;
  /** Every pending flag, hydrated with place + flagger names. Admin only. */
  listPendingFlags(): Promise<PlaceFlag[]>;
  /**
   * Resolves every pending flag on a place in one action — admin only.
   * `resolution: "blocked"` also blocks the place and requires `reason`,
   * exactly like `blockPlace`. Throws if the place has no pending flags.
   */
  resolvePlaceFlags(
    adminId: string,
    placeId: string,
    resolution: FlagResolution,
    reason?: string | null
  ): Promise<void>;
}

/** Method names the conformance test walks. Keep in sync with the interface. */
export const REPO_METHODS = [
  "listPlaces",
  "getPlace",
  "createPlace",
  "updatePlace",
  "deletePlace",
  "listVisits",
  "createVisit",
  "updateVisit",
  "deleteVisit",
  "listPublicReviews",
  "getWalkCache",
  "upsertWalkCache",
  "listOffices",
  "createOffice",
  "getUserPrefs",
  "upsertUserPrefs",
  "getProfile",
  "upsertProfile",
  "getDisplayNames",
  "listAllUsers",
  "completeOnboarding",
  "createEvent",
  "createFlexiEvent",
  "getEvent",
  "listEvents",
  "addCandidateDate",
  "markDateAvailability",
  "confirmEventDate",
  "addInviteesToEvent",
  "addOptionToEvent",
  "removeOptionFromEvent",
  "suggestOptionsForEvent",
  "castBallot",
  "rsvp",
  "closeEvent",
  "listWishlist",
  "toggleWishlist",
  "createKaki",
  "getKaki",
  "listKakis",
  "joinKaki",
  "leaveKaki",
  "sendLobang",
  "listLobangsReceived",
  "listLobangsSent",
  "markLobangSeen",
  "dismissLobang",
  "suggestPlacesForFriend",
  "isAdmin",
  "blockPlace",
  "unblockPlace",
  "listModerationLog",
  "reviewPlace",
  "flagPlace",
  "listMyFlags",
  "listPendingFlags",
  "resolvePlaceFlags",
] as const;

export type RepoMethod = (typeof REPO_METHODS)[number];
