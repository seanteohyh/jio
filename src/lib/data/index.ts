import type {
  EventDetail,
  Filters,
  Kaki,
  KakiDetail,
  Lobang,
  LunchEvent,
  ModerationLogEntry,
  Office,
  Place,
  Profile,
  Reco,
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
  listPlaces(filters?: Partial<Filters>): Promise<Place[]>;
  getPlace(id: string): Promise<Place | null>;
  createPlace(
    data: Omit<Place, "id" | "created_at" | "updated_at">
  ): Promise<Place>;
  updatePlace(id: string, data: Partial<Place>): Promise<Place>;
  deletePlace(id: string): Promise<void>;

  // ---- Visits & reviews ----
  listVisits(placeId?: string, userId?: string): Promise<Visit[]>;
  createVisit(data: Omit<Visit, "id" | "created_at">): Promise<Visit>;
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
  getEvent(idOrToken: string): Promise<EventDetail | null>;
  listEvents(userId: string): Promise<LunchEvent[]>;
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

  // ---- Recos (the Food Pool) ----
  createReco(
    userId: string,
    placeId: string,
    comment?: string | null
  ): Promise<Reco>;
  deleteReco(userId: string, placeId: string): Promise<void>;
  listRecos(limit?: number): Promise<Reco[]>;
  listRecosForPlace(placeId: string): Promise<Reco[]>;

  // ---- Kakis (lunch groups) ----
  createKaki(userId: string, name: string): Promise<Kaki>;
  getKaki(idOrToken: string): Promise<KakiDetail | null>;
  listKakis(userId: string): Promise<Kaki[]>;
  joinKaki(token: string, userId: string): Promise<Kaki>;
  leaveKaki(kakiId: string, userId: string): Promise<void>;

  // ---- Lobangs (personalized recos sent to one teammate) ----
  sendLobang(
    fromUserId: string,
    toUserId: string,
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
   * already allowed to see under RLS (the target's *public* visits, plus
   * the team-wide reco pool) — never their private prefs or private visits.
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
  "createEvent",
  "getEvent",
  "listEvents",
  "addInviteesToEvent",
  "addOptionToEvent",
  "removeOptionFromEvent",
  "castBallot",
  "rsvp",
  "closeEvent",
  "listWishlist",
  "toggleWishlist",
  "createReco",
  "deleteReco",
  "listRecos",
  "listRecosForPlace",
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
] as const;

export type RepoMethod = (typeof REPO_METHODS)[number];
