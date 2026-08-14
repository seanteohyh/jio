import type {
  AccountMergePreview,
  AdminAnalytics,
  DuplicateProfileGroup,
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
  PublicPlace,
  PlacesPagination,
  Profile,
  PushSubscriptionInput,
  PushTarget,
  RecurringSeries,
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

  /**
   * The public-preview counterpart to `getPlace` — CHANGES_20260812.md §4.
   * No auth required, returns `null` for a missing place *or* one that
   * isn't `active` (needs-review and blocked places stay unlisted), and
   * never returns more than `PublicPlace` carries. `place.id` doubles as
   * the public identifier — there is no separate share token to leak or to
   * rotate if a link gets passed around further than intended.
   */
  getPublicPlace(id: string): Promise<PublicPlace | null>;
  createPlace(
    data: Omit<Place, "id" | "created_at" | "updated_at">
  ): Promise<Place>;
  updatePlace(id: string, data: Partial<Place>): Promise<Place>;
  deletePlace(id: string): Promise<void>;

  // ---- Visits & reviews ----
  listVisits(placeId?: string, userId?: string): Promise<Visit[]>;
  createVisit(
    data: Omit<Visit, "id" | "created_at" | "like_count">
  ): Promise<Visit>;

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

  /** `viewerId`, when given, populates `liked_by_me` on each review. */
  listPublicReviews(placeId: string, viewerId?: string): Promise<Visit[]>;

  /**
   * Toggle the caller's like on a review — on if it wasn't liked, off if it
   * was, same "no separate add/remove endpoints" shape as `toggleWishlist`.
   * `visit_user_id` comes back so the caller can decide whether to push a
   * notification without a second lookup (and can skip a self-like).
   */
  toggleReviewLike(
    userId: string,
    visitId: string
  ): Promise<{ liked: boolean; like_count: number; visit_user_id: string }>;
  /**
   * Throttle claim for the like-triggered push (048_review_likes.sql) — same
   * shape as `claimVotePushWindow`, returns `true` at most once per
   * `windowSeconds` (default 10 min) for a given review.
   */
  claimReviewLikePushWindow(
    visitId: string,
    windowSeconds?: number
  ): Promise<boolean>;
  /**
   * Every like since `sinceIso`, with the liked review's owner — feeds the
   * weekly recap cron, which buckets these by `sgtWeekKey` itself rather
   * than this method knowing about "weeks."
   */
  listReviewLikesSince(
    sinceIso: string
  ): Promise<Array<{ visit_id: string; visit_user_id: string; created_at: string }>>;

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

  // ---- Push notifications (§6) ----
  /** Upserts on `endpoint` — resubscribing the same browser replaces its
   *  old keys rather than accumulating duplicates. */
  savePushSubscription(
    userId: string,
    sub: PushSubscriptionInput
  ): Promise<void>;
  /** Removes one subscription by endpoint — unsubscribing, or the send path
   *  cleaning up after the push service reports it gone (410/404). */
  deletePushSubscription(endpoint: string): Promise<void>;
  /** The one on/off preference covering every Jio-lifecycle push. */
  setNotifyEvents(userId: string, enabled: boolean): Promise<void>;
  /**
   * Every push-capable subscription for the given users, already filtered
   * to those with `notify_events` on. The one place this feature reads
   * across users — see migration 037's comment for why that's a
   * `SECURITY DEFINER` function in live mode rather than a plain query RLS
   * would just refuse.
   */
  getPushTargets(userIds: string[]): Promise<PushTarget[]>;
  /**
   * Powers the invite picker. Filtering happens here, not in the route —
   * see docs/user-discovery.md §4.1: a client-side or route-level filter
   * over "every user" keeps working while quietly getting heavier as the
   * team grows, with no point at which it obviously breaks.
   *
   * `officeId` scopes results to that office, resolved from the caller's
   * own `user_prefs.default_office_id` (falling back to the default office)
   * — the only per-user office reference the schema has today. Office is a
   * hard boundary for discovery per §6 of that doc, so this is not optional
   * when the offices feature is on.
   */
  listAllUsers(query?: string, officeId?: string): Promise<TeamUser[]>;
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
    inviteeIds?: string[],
    hideVotes?: boolean
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
    inviteeIds?: string[],
    hideVotes?: boolean
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
  /**
   * Self-service — "following the link is the acceptance" (§4). Adds the
   * *caller* as an invitee, never anyone else; a no-op if they're already
   * the host or already invited. Called when a signed-in user lands on an
   * event's own invite link, so a visitor who never RSVPs or votes still
   * has a real footprint and isn't invisible to listEvents() everywhere
   * it's used — Jios tab included.
   */
  joinEventViaInvite(eventId: string, userId: string): Promise<void>;
  addOptionToEvent(
    eventId: string,
    placeId: string,
    userId: string
  ): Promise<void>;
  /**
   * "Vote first, prompt after" (CHANGES_20260801.md §8) — for when the
   * add-a-place search on an open vote comes up empty. Logs a votable
   * option with no `places` row behind it; see the `place_id` doc comment
   * on `EventOption` for how that stays compatible with plain ranked
   * voting. Same authorization as `addOptionToEvent`.
   */
  addFreeTextOptionToEvent(
    eventId: string,
    label: string,
    userId: string
  ): Promise<EventOption>;
  /**
   * Upgrades a free-text option to a real place, after the non-blocking
   * "add it to the pool?" prompt is accepted. Moves any votes already cast
   * for the draft option along with it, so ranking it before it became a
   * real place is not silently discarded. Only whoever added the option, or
   * the host, may do this — same shape of gate as block/unblock in
   * 017_admin_and_moderation.sql: a structural state change goes through a
   * dedicated path, not a raw field write.
   */
  attachPlaceToOption(
    eventId: string,
    oldPlaceId: string,
    newPlaceId: string,
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
  /**
   * Throttle claim for the "someone voted" push (038_vote_push_throttle.sql)
   * — returns `true` at most once per `windowSeconds` (default 10 min) for a
   * given event. The vote route calls this right after `castBallot`; only a
   * `true` result should actually send a push. Not a debounce — see the
   * migration's comment for why a real quiet-period wait isn't feasible here.
   */
  claimVotePushWindow(
    eventId: string,
    windowSeconds?: number
  ): Promise<boolean>;
  /**
   * Lazy, page-load-triggered "starting soon" reminder — same shape as
   * `generateDueOccurrences` (039_close_reminder.sql explains why this isn't
   * cron-driven). Scans `userId`'s own events for any within the reminder
   * window that haven't fired yet, atomically claims each one so it only
   * ever fires once, and returns who still needs nudging — the caller (an
   * API route) is responsible for actually sending the push.
   */
  remindDueEvents(
    userId: string
  ): Promise<Array<{ eventId: string; title: string; recipientIds: string[] }>>;
  /**
   * Calls off an open Jio — a new terminal state, not a reuse of `closed`
   * (CHANGES_20260801.md §9). Host only, and only from `open`; see
   * 030_cancel_event.sql for why this goes through a dedicated function
   * rather than a plain status write.
   */
  cancelEvent(eventId: string, hostId: string): Promise<EventDetail>;

  // ---- Recurring series ("Recurring Jios", CHANGES_20260801.md §10) ----
  createRecurringSeries(
    data: Omit<
      RecurringSeries,
      "id" | "status" | "last_generated_date" | "created_at"
    >
  ): Promise<RecurringSeries>;
  /** A host's own series — this is the surface for managing them. */
  listRecurringSeries(hostId: string): Promise<RecurringSeries[]>;
  cancelRecurringSeries(seriesId: string, hostId: string): Promise<void>;
  /**
   * Generates the next occurrence of each of `hostId`'s active series, if
   * one falls due within the lookahead window — see 031_recurring_series.sql
   * for why this is lazy (host-triggered, on page load) rather than cron- or
   * SECURITY-DEFINER-driven. Never backfills more than one occurrence per
   * series per call. Returns how many were generated, for callers that want
   * to know whether to refresh anything.
   */
  generateDueOccurrences(hostId: string): Promise<number>;

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
  /**
   * Adds an existing user to a Kaki directly, without an invite link
   * changing hands first — CHANGES_20260812.md §1. `addedBy` must already
   * be a member; any current member may add anyone, same trust level as
   * the invite link (anyone holding it can already join themselves). A
   * no-op if `userId` is already a member.
   */
  addKakiMember(
    kakiId: string,
    userId: string,
    addedBy: string
  ): Promise<void>;

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
  /** Every admin's user id — for notifying "an admin", not one specific
   *  person. CHANGES_20260807c.md §3 item 5's duplicate-name push reads
   *  this rather than hardcoding who happens to be an admin today. */
  listAdminIds(): Promise<string[]>;
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
   * §13 admin analytics dashboard, Phase 1. Admin only — the caller must
   * check `isAdmin` first (same pattern as every other admin surface); this
   * method itself trusts the caller, matching `listModerationLog`/
   * `listPendingFlags`. Fixed 90-day trailing window unless `days` is given.
   */
  getAdminAnalytics(days?: number): Promise<AdminAnalytics>;
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

  // ---- Account merge (CHANGES_20260807.md §4/§5) ----
  /**
   * Groups every profile by case/whitespace-normalized display name,
   * returning only groups of 2+ — the raw material for §5's "possible
   * duplicate accounts" admin list. Admin-only: the caller must check
   * `isAdmin` first, same convention as `getAdminAnalytics`.
   */
  listDuplicateProfiles(): Promise<DuplicateProfileGroup[]>;
  /** Row counts per table for one account — shown before a merge commits,
   *  so "what will move" isn't a surprise after the fact. */
  previewAccountMerge(userId: string): Promise<AccountMergePreview>;
  /**
   * Moves every row `mergeUserId` owns (Jios hosted, votes, RSVPs, invites,
   * Kaki ownership/membership, wishlist, visits, push subscriptions, prefs)
   * onto `keepUserId`, then retires the now-empty account. Two front
   * doors, one operation: §4 is self-service (`keepUserId` must equal
   * `callerId` — reclaiming your own name pulls another account's data
   * onto the session you're currently signed in as, since there's no way
   * to swap which `auth.uid()` a browser holds instead), §5 is
   * admin-triggered (`callerId` must be an admin; picks both sides
   * directly). See migration 040 for the reassignment/collision handling,
   * and `serviceClient.ts` for why retiring the old account needs the
   * service role.
   */
  mergeUserAccounts(
    callerId: string,
    keepUserId: string,
    mergeUserId: string
  ): Promise<void>;
  /**
   * Collision-safe counterpart to name-based claim — a fresh unguessable
   * token tied to one specific account rather than a name, so it stays safe
   * once two different real people can share a display name. Self
   * (`userId === callerId`) or admin. Regenerating overwrites and retires
   * any previous token for that account.
   */
  generateRecoveryToken(callerId: string, userId: string): Promise<string>;
  /**
   * The other half — resolves a token back to the account it belongs to, or
   * `null` if it's unknown/already used. No authorization check by design:
   * same "possession of the token is the invite" reasoning as an event or
   * Kaki invite link. The caller (an API route) is responsible for what it
   * does with the resolved id — normally feeding it into
   * `mergeUserAccounts` as the merge side.
   */
  resolveRecoveryToken(token: string): Promise<string | null>;
}

/** Method names the conformance test walks. Keep in sync with the interface. */
export const REPO_METHODS = [
  "listPlaces",
  "getPlace",
  "getPublicPlace",
  "createPlace",
  "updatePlace",
  "deletePlace",
  "listVisits",
  "createVisit",
  "updateVisit",
  "deleteVisit",
  "listPublicReviews",
  "toggleReviewLike",
  "claimReviewLikePushWindow",
  "listReviewLikesSince",
  "getWalkCache",
  "upsertWalkCache",
  "listOffices",
  "createOffice",
  "getUserPrefs",
  "upsertUserPrefs",
  "getProfile",
  "upsertProfile",
  "getDisplayNames",
  "savePushSubscription",
  "deletePushSubscription",
  "setNotifyEvents",
  "getPushTargets",
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
  "joinEventViaInvite",
  "addOptionToEvent",
  "addFreeTextOptionToEvent",
  "attachPlaceToOption",
  "removeOptionFromEvent",
  "suggestOptionsForEvent",
  "castBallot",
  "rsvp",
  "closeEvent",
  "claimVotePushWindow",
  "remindDueEvents",
  "cancelEvent",
  "createRecurringSeries",
  "listRecurringSeries",
  "cancelRecurringSeries",
  "generateDueOccurrences",
  "listWishlist",
  "toggleWishlist",
  "createKaki",
  "getKaki",
  "listKakis",
  "joinKaki",
  "leaveKaki",
  "addKakiMember",
  "sendLobang",
  "listLobangsReceived",
  "listLobangsSent",
  "markLobangSeen",
  "dismissLobang",
  "suggestPlacesForFriend",
  "isAdmin",
  "listAdminIds",
  "getAdminAnalytics",
  "blockPlace",
  "unblockPlace",
  "listModerationLog",
  "reviewPlace",
  "flagPlace",
  "listMyFlags",
  "listPendingFlags",
  "resolvePlaceFlags",
  "listDuplicateProfiles",
  "previewAccountMerge",
  "mergeUserAccounts",
  "generateRecoveryToken",
  "resolveRecoveryToken",
] as const;

export type RepoMethod = (typeof REPO_METHODS)[number];
