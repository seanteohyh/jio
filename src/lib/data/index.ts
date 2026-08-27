import type {
  AccountMergePreview,
  AdminAnalytics,
  CuisineMergePreview,
  CuisineOption,
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
  PublicLobang,
  PublicPlace,
  PersonalInvite,
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
    data: Omit<Place, "id" | "created_at" | "updated_at" | "google_place_id">
  ): Promise<Place>;
  updatePlace(id: string, data: Partial<Place>): Promise<Place>;
  deletePlace(id: string): Promise<void>;
  /**
   * The one legitimate way to set `google_place_id` (CHANGES_20260814.md
   * §2, migration 049) — a system-computed match, excluded from
   * `updatePlace`'s writable columns the same way `avg_rating` is. Called
   * by the app server after `resolveAndStoreGooglePlaceId`
   * (`lib/googlePlaces.ts`) runs, never directly from client input.
   * `googlePlaceId: null` clears a previous match (e.g. a name edit that no
   * longer resolves confidently).
   */
  setGooglePlaceId(placeId: string, googlePlaceId: string | null): Promise<void>;

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
   * Powers every teammate picker (invite, add-to-Kaki, lobang recipients).
   * Filtering happens here, not in the route — see docs/user-discovery.md
   * §4.1: a client-side or route-level filter over "every user" keeps
   * working while quietly getting heavier as the team grows, with no point
   * at which it obviously breaks.
   *
   * `officeId` scopes results to that office, resolved from the caller's
   * own `user_prefs.default_office_id` (falling back to the default office)
   * — the only per-user office reference the schema has today. Office is a
   * hard boundary for discovery per §6 of that doc, so this is not optional
   * when the offices feature is on.
   *
   * Ordered by co-attendance, not alphabetically — §4.2 / CHANGES_20260818.md
   * §3. Tier 1: people `callerId` has shared a Jio with (host or invitee,
   * either side), ranked by frequency × recency decay
   * (`discoveryConfig.ts`). Tier 2: `callerId`'s Kaki co-members not
   * already in tier 1, by Kaki name then display name. Tier 3: everyone
   * else in the office — included only when `query` is non-empty ("search
   * only, not listed by default"), so the default (no-query) result is
   * the *suggested* list, not the full roster.
   *
   * `includeIds` force-includes specific users regardless of tier or
   * query match — for a multi-select picker to keep resolving the display
   * name of something already picked even after the search text that
   * originally surfaced it changes or clears. Without this, a tier-3
   * person found by searching, then selected, would silently lose their
   * name off the "selected" chips the moment the search box is cleared.
   */
  listAllUsers(
    callerId: string,
    query?: string,
    officeId?: string,
    includeIds?: string[]
  ): Promise<TeamUser[]>;
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
   * here). `scheduled_at` is seeded to the earliest of them, at `timeOfDay`
   * (Singapore local, "HH:MM"; defaults to noon), as a provisional value —
   * see the `LunchEvent.scheduled_at` doc comment. Built via an explicit
   * `+08:00` offset, not a bare date string — a bare "YYYY-MM-DD" always
   * parses as UTC midnight, which is what read as "8:00 am" once formatted
   * in Singapore time.
   */
  createFlexiEvent(
    hostId: string,
    title: string,
    officeId: string,
    candidateDates: string[],
    kakiId?: string | null,
    inviteeIds?: string[],
    hideVotes?: boolean,
    timeOfDay?: string
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
   * Host-only, works before or after the Jio is decided — CHANGES_20260819b.md.
   * Also drops the removed person's own RSVP, ballot and any Flexi
   * date-availability on this event, so a stray response doesn't linger for
   * someone no longer in it. Anything they *added* (an option, a candidate
   * date) is left alone — still useful to whoever's left.
   */
  removeInviteeFromEvent(
    eventId: string,
    userId: string,
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
   * Upgrades a free-text option to a real place — after the non-blocking
   * "add it to the pool?" prompt is accepted, or via the persistent link any
   * viewer gets next to a free-text option while the Jio is still open
   * (CHANGES_20260819d.md §1). Moves any votes already cast for the draft
   * option along with it, so ranking it before it became a real place is
   * not silently discarded. Any Jio participant — host, kaki member, or
   * invitee — may do this, not just whoever originally typed the option in
   * (widened by migration 056; a structural state change like this still
   * goes through a dedicated path, not a raw field write, same shape as
   * block/unblock in 017_admin_and_moderation.sql).
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
   * CHANGES_20260821c.md §1 — this event's per-Jio reminder override for
   * `userId`, if they've set one (`null` means "using their `user_prefs`
   * default"). A genuinely different feature from `remindDueEvents` above,
   * not a variant: confirmed-going only, per-person configurable, one-shot
   * per (event, user) rather than per event.
   */
  getEventReminderOverride(
    eventId: string,
    userId: string
  ): Promise<number | null>;
  /** Sets or clears (`null`) `userId`'s per-Jio lead-time override for this
   *  event. Never touches whether it's already fired. */
  setEventReminderOverride(
    eventId: string,
    userId: string,
    leadMinutes: number | null
  ): Promise<void>;
  /**
   * The scheduled "starting soon" scan — hit by an external scheduler
   * (README's cron-job.org pattern), not Vercel's own cron, since it needs
   * to run far more often than Hobby's once-a-day limit allows. Scans
   * every non-cancelled, still-upcoming Jio's confirmed-going (RSVP `yes`)
   * attendees, works out each one's effective lead time (their per-Jio
   * override, else their `user_prefs` default), atomically claims and
   * returns whoever is due and hasn't been sent yet — the caller (the cron
   * route) is responsible for actually sending the push, same division of
   * labour as `remindDueEvents`.
   */
  listAndClaimDueReminders(): Promise<
    Array<{
      eventId: string;
      userId: string;
      title: string;
      scheduledAt: string;
    }>
  >;
  /**
   * Calls off an open Jio — a new terminal state, not a reuse of `closed`
   * (CHANGES_20260801.md §9). Host only, and only from `open`; see
   * 030_cancel_event.sql for why this goes through a dedicated function
   * rather than a plain status write.
   */
  cancelEvent(eventId: string, hostId: string): Promise<EventDetail>;
  /**
   * CHANGES_20260819c.md §1 — a host-only correction to when a Jio actually
   * is, available at any time (including after it's closed) except once
   * cancelled. Push reminders and calendar export need no separate sync —
   * both read `scheduled_at` live off the event. A still-polling Flexi
   * Jio's date finalizes the same way confirming a candidate does (moves
   * `date_phase` to `confirmed`), just not restricted to the pre-listed
   * candidates, since the host is typing a date directly.
   */
  rescheduleEvent(
    eventId: string,
    hostId: string,
    newScheduledAt: string
  ): Promise<EventDetail>;
  /**
   * CHANGES_20260819c.md §2 — "where did you actually go?", host-only, only
   * once a Jio is `closed`. Deliberately small scope: corrects the Jio's
   * own record (`PastJios`, the lobang-send default, calendar export) but
   * does not touch anyone's `visits` row — nothing currently connects a
   * Jio's outcome to personal metrics, so this alone won't move anyone's
   * stats, which is expected, not a bug to chase.
   */
  editEventWinner(
    eventId: string,
    hostId: string,
    newPlaceId: string
  ): Promise<EventDetail>;
  /**
   * Undoes a close — host-only, only from `closed`, and only while the
   * scheduled time is still in the future (reopening a lunch that's already
   * happened doesn't mean anything). Existing ballots are left exactly as
   * they were, same as `cancelEvent` leaves everything else about the row
   * alone: a vote already persists until its owner recasts it, so "reopen"
   * just means "accept new/changed ballots again," not "start over." Clears
   * `winner_place_id` and `closed_at` since neither describes reality once
   * voting is live again — closing later recomputes both.
   *
   * A structural state change, so this goes through a dedicated function
   * (058_reopen_event.sql) rather than a plain status write, same reasoning
   * 030_cancel_event.sql lays out for `cancelled`.
   */
  reopenEvent(eventId: string, hostId: string): Promise<EventDetail>;

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
   * CHANGES_20260819b.md §3 — reuses the creation form, so `updates` is the
   * same full field set `createRecurringSeries` takes rather than a sparse
   * delta; validation (weekday range, time format, place-required-per-mode)
   * lives in the route, same division of labor as `createRecurringSeries`.
   *
   * Also propagates onto any of this series' already-generated occurrences
   * that are still `open` — "any Jio not confirmed yet, if pending, should
   * also change" (Sean's call). Per occurrence:
   *  - `time_of_day` always propagates (harmless either way) — but the
   *    *weekday* never moves an existing occurrence; its calendar date is
   *    already fixed the moment it was generated, so only future
   *    occurrences pick up a weekday change.
   *  - Place/mode/invitees propagate too, but only if nobody's cast a
   *    ballot or RSVP on that occurrence yet — once someone has, changing
   *    what they voted on out from under them would invalidate their
   *    answer, so that occurrence is left alone from there.
   */
  updateRecurringSeries(
    seriesId: string,
    hostId: string,
    updates: Partial<
      Omit<
        RecurringSeries,
        "id" | "host_id" | "office_id" | "status" | "last_generated_date" | "created_at"
      >
    >
  ): Promise<RecurringSeries>;
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

  // ---- Lobangs (personalized tip-offs sent to a teammate, a Kaki, or the public) ----
  /**
   * Sends a lobang to a list of specific teammates, every current member
   * of a Kaki (snapshotted into `lobang_recipients` at send time — a later
   * membership change never alters who a past lobang went to), or
   * publicly (CHANGES_20260816.md §4, `{ type: "public" }`) — a token-only
   * send with no recipient rows at all, resolved later through
   * `getPublicLobang`. The sender is always excluded from a teammates/Kaki
   * recipient list, even if they are a member of the target Kaki. A
   * `{ type: "kaki" }` target is rejected unless `fromUserId` is currently
   * a member of that Kaki. Throws if a teammates/Kaki send resolves to an
   * empty recipient list; a public send has no such check, since it never
   * had one to begin with.
   *
   * Returns the resolved `recipient_ids` alongside the hydrated lobang
   * (CHANGES_20260819e.md §1) so the API route can push a "you got a
   * lobang" notification without re-deriving Kaki membership itself —
   * empty for a public send, which has nobody to notify.
   */
  sendLobang(
    fromUserId: string,
    target: LobangTarget,
    placeId: string,
    note?: string | null,
    eventId?: string | null
  ): Promise<Lobang & { recipient_ids: string[] }>;
  /** Never includes a public send (`public_token is not null`) — nobody
   *  "received" it, so it belongs in neither inbox. */
  listLobangsReceived(userId: string, limit?: number): Promise<Lobang[]>;
  /** Excludes a public send the same way `listLobangsReceived` does —
   *  neither list is where "will not be saved" is meant to be checkable. */
  listLobangsSent(userId: string, limit?: number): Promise<Lobang[]>;
  markLobangSeen(userId: string, lobangId: string): Promise<void>;
  dismissLobang(userId: string, lobangId: string): Promise<void>;
  /**
   * Resolves a public lobang's token to the same narrow, privacy-safe
   * shape `getPublicPlace` uses — `null` for an unknown token or one whose
   * place is no longer `active`. `SECURITY DEFINER` live (migration 051):
   * `lobangs_select` (050) is `authenticated`-only, and `from_display_name`
   * has to be resolved server-side from the token to be safe to show an
   * anonymous visitor — never a client-supplied name.
   */
  getPublicLobang(token: string): Promise<PublicLobang | null>;
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

  // ---- Cuisines (CHANGES_20260818.md §6) ----
  /** Every cuisine currently available app-wide — the runtime-extensible
   *  replacement for the old hardcoded `CUISINES` constant. Alphabetical
   *  by label, for a stable picker order. */
  listCuisines(): Promise<CuisineOption[]>;
  /**
   * Adds a new permanent cuisine, normalizing `label` into a lowercase,
   * underscore-separated slug — same discipline as `nameAuth`'s name
   * matching. Idempotent on an exact slug collision: returns the existing
   * row rather than throwing, since two people racing to add the same
   * cuisine is a near-duplicate, not a conflict. Whether a non-admin may
   * call this at all is `config.cuisineAddOpenToAnyone`, checked by the API
   * route — this method itself stays config-agnostic, same reasoning
   * `nameClaimEnabled` is checked in `nameAuth.ts` rather than any `Repo`
   * method.
   */
  addCuisine(userId: string, label: string): Promise<CuisineOption>;
  /** Places + profile-preference reference counts for each candidate slug
   *  — shown before an admin combine commits. Admin only. */
  previewCuisineMerge(slugs: string[]): Promise<CuisineMergePreview[]>;
  /**
   * Folds `mergeSlug` into `keepSlug` everywhere it's referenced (places'
   * `cuisine` arrays, profiles' `cuisine_likes`/`cuisine_dislikes`),
   * deduping, then retires the merged-away row. Admin only — mirrors
   * `mergeUserAccounts`'s "keeper absorbs, loser retires" shape.
   */
  mergeCuisines(
    callerId: string,
    keepSlug: string,
    mergeSlug: string
  ): Promise<void>;

  // ---- Personal invite links (CHANGES_20260818.md §3 / docs/user-discovery.md §4.3) ----
  /**
   * Self or admin. Regenerating overwrites and retires any previous token
   * for that account — same "no way to list or recover an old one, only
   * mint a fresh one" shape as `generateRecoveryToken`, just a different
   * threat model: this one is meant to be handed out, not kept secret.
   */
  generatePersonalInviteToken(
    callerId: string,
    userId: string
  ): Promise<string>;
  /**
   * Resolves a personal invite token to the minimum needed to render
   * `/u/[token]` — `null` if unknown. No authorization check by design,
   * same "possession of the token is the invite" reasoning as every other
   * token in this schema.
   */
  resolvePersonalInvite(token: string): Promise<PersonalInvite | null>;
}

/** Method names the conformance test walks. Keep in sync with the interface. */
export const REPO_METHODS = [
  "listPlaces",
  "getPlace",
  "getPublicPlace",
  "createPlace",
  "updatePlace",
  "deletePlace",
  "setGooglePlaceId",
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
  "removeInviteeFromEvent",
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
  "getEventReminderOverride",
  "setEventReminderOverride",
  "listAndClaimDueReminders",
  "cancelEvent",
  "rescheduleEvent",
  "editEventWinner",
  "reopenEvent",
  "createRecurringSeries",
  "listRecurringSeries",
  "cancelRecurringSeries",
  "updateRecurringSeries",
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
  "getPublicLobang",
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
  "listCuisines",
  "addCuisine",
  "previewCuisineMerge",
  "mergeCuisines",
  "generatePersonalInviteToken",
  "resolvePersonalInvite",
] as const;

export type RepoMethod = (typeof REPO_METHODS)[number];
