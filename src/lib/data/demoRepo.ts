import {
  DEFAULT_CUISINE_SEED,
  DEFAULT_OFFICE,
  DEMO_USER_ID,
  RECURRING_LOOKAHEAD_DAYS,
} from "@/lib/constants";
import {
  dateKey,
  estimateWalkMinutes,
  generateToken,
  haversine,
  nextOccurrence,
  sgtTimeOfDay,
  sgtToday,
  slugifyCuisine,
  sortPlacesForList,
  uuid,
} from "@/lib/utils";
import { pickCommitteeSuggestions } from "@/lib/suggestCommittee";
import { computeWinner } from "@/lib/voting";
import { computeUserMetrics } from "@/lib/metrics";
import { rankPlaces } from "@/lib/recommend";
import { DISCOVERY_CONFIG } from "@/lib/discoveryConfig";
import {
  bucketByDay,
  bucketByWeek,
  bucketDistinctUsersByDay,
  bucketDistinctUsersByWeek,
  bucketDistinctUsersByMonth,
  bucketWalkMinutes,
  isSameSgtDay,
  median,
  sgtDateKey,
  sgtWeekKey,
  type UserActivity,
} from "@/lib/adminAnalytics";
import {
  DEMO_TEAMMATE_A,
  DEMO_TEAMMATE_B,
  buildDemoPlaces,
  buildDemoVisits,
  demoEventOptions,
  demoEventRsvps,
  demoEventVotes,
  demoEvents,
  demoKakiMembers,
  demoKakis,
  demoLobangRecipients,
  demoLobangs,
  demoOffices,
  demoProfiles,
  demoUserPrefs,
  demoWishlist,
} from "./demoData";
import type { Repo } from "./index";
import type {
  AdminEngagementWeights,
  CuisineMergePreview,
  CuisineOption,
  EventCandidateDate,
  EventDateVote,
  EventDetail,
  EventReminderState,
  EventInvitee,
  EventOption,
  EventRsvp,
  EventVote,
  Filters,
  FlagReason,
  FlagResolution,
  FoodIdentityCard,
  GeneralReport,
  GeneralReportCategory,
  Kaki,
  KakiDetail,
  KakiFoodIdentityCard,
  KakiFoodIdentitySnapshot,
  KakiMember,
  Lobang,
  LobangTarget,
  LunchEvent,
  MemberData,
  ModerationLogEntry,
  Office,
  PersonalInvite,
  Place,
  PlaceFlag,
  Profile,
  PushTarget,
  RecurringSeries,
  RsvpResponse,
  TeamUser,
  UserFoodIdentitySnapshot,
  UserPrefs,
  Visit,
  WalkCacheEntry,
  WishlistEntry,
} from "@/types";

/**
 * In-memory repository.
 *
 * Backs demo mode, and doubles as the reference implementation: it is the
 * shortest complete description of what every `Repo` method is supposed to do.
 *
 * State hangs off `globalThis` deliberately. Next.js gives each route bundle
 * its own module registry and re-evaluates modules on hot reload, so a plain
 * module-level array would mean your event vanishing between two clicks.
 */

interface DemoStore {
  places: Place[];
  visits: Visit[];
  offices: Office[];
  prefs: UserPrefs[];
  profiles: Profile[];
  events: LunchEvent[];
  options: EventOption[];
  votes: EventVote[];
  rsvps: EventRsvp[];
  invitees: EventInvitee[];
  candidateDates: EventCandidateDate[];
  dateVotes: EventDateVote[];
  wishlist: WishlistEntry[];
  /** UX review log #25 / migration 070 — one row per (user, event) that has
   *  already seen its decided-Jio celebration. */
  decidedCelebrationViews: { user_id: string; event_id: string; shown_at: string }[];
  /** Migration 078 — one row per (user, event) that has dismissed the
   *  "turn this into a Kaki?" bridge suggestion for that Jio. */
  kakiBridgeDismissals: { user_id: string; event_id: string; dismissed_at: string }[];
  reviewLikes: { visit_id: string; user_id: string; created_at: string }[];
  lobangs: Lobang[];
  /** Recipients, snapshotted at send time. */
  lobangRecipients: { lobang_id: string; user_id: string; seen_at: string | null }[];
  kakis: Kaki[];
  kakiMembers: KakiMember[];
  walkCache: WalkCacheEntry[];
  moderationLog: ModerationLogEntry[];
  placeFlags: PlaceFlag[];
  generalReports: GeneralReport[];
  recurringSeries: RecurringSeries[];
  pushSubscriptions: {
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth_key: string;
  }[];
  /** Kept out of the `Profile` type on purpose, same reason it's excluded
   *  from the client-readable column grant in live mode (041) — this is
   *  never something a client should be able to read off a profile. */
  recoveryTokens: { user_id: string; token: string }[];
  cuisines: CuisineOption[];
  discoveryTokens: { user_id: string; token: string }[];
  eventReminders: EventReminderState[];
  /** Part 1 §B — the composite engagement score's per-signal weights,
   *  equal by default but admin-editable (`updateEngagementWeights`), same
   *  singleton-row shape as `admin_engagement_weights` in live mode. */
  engagementWeights: AdminEngagementWeights;
  /** CHANGES_20260821_combined2.md Item 1 — locked monthly food identity
   *  snapshots, written only by the monthly cron. Carries the id fields
   *  the real tables key on but the plain `UserFoodIdentitySnapshot`/
   *  `KakiFoodIdentitySnapshot` types don't (the caller already knows
   *  whose row it is), same reason other demo-store rows sometimes carry
   *  a bit more than what's returned to callers. */
  userFoodIdentitySnapshots: (UserFoodIdentitySnapshot & { user_id: string })[];
  kakiFoodIdentitySnapshots: (KakiFoodIdentitySnapshot & { kaki_id: string })[];
  /** Daily Activity Log — one row per (user, Asia/Singapore calendar day),
   *  incremented on every page view. Mirrors `app_daily_visits`. */
  dailyVisits: {
    user_id: string;
    visit_date: string;
    page_view_count: number;
    first_seen_at: string;
    last_seen_at: string;
  }[];
  /** Mirrors `action_events` — the generic action log instrumented across
   *  every write path §5 lists. */
  actionEvents: {
    id: string;
    user_id: string;
    action: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[];
}

const globalStore = globalThis as typeof globalThis & {
  __jioDemoStore?: DemoStore;
};

function seed(): DemoStore {
  return {
    places: buildDemoPlaces(),
    visits: buildDemoVisits(),
    offices: [...demoOffices],
    prefs: demoUserPrefs.map((p) => ({ ...p })),
    profiles: demoProfiles.map((p) => ({ ...p })),
    events: demoEvents.map((e) => ({ ...e })),
    options: demoEventOptions.map((o) => ({ ...o })),
    votes: demoEventVotes.map((v) => ({ ...v })),
    rsvps: demoEventRsvps.map((r) => ({ ...r })),
    invitees: [],
    candidateDates: [],
    dateVotes: [],
    wishlist: demoWishlist.map((w) => ({ ...w })),
    decidedCelebrationViews: [],
    kakiBridgeDismissals: [],
    reviewLikes: [],
    lobangs: demoLobangs.map((l) => ({ ...l })),
    lobangRecipients: demoLobangRecipients.map((r) => ({ ...r })),
    kakis: demoKakis.map((k) => ({ ...k })),
    kakiMembers: demoKakiMembers.map((m) => ({ ...m })),
    walkCache: [],
    moderationLog: [],
    placeFlags: [],
    generalReports: [],
    recurringSeries: [],
    pushSubscriptions: [],
    recoveryTokens: [],
    cuisines: DEFAULT_CUISINE_SEED.map((c) => ({ ...c })),
    discoveryTokens: [],
    eventReminders: [],
    engagementWeights: {
      hosted: 1,
      voted: 1,
      rsvp: 1,
      visit: 1,
      review: 1,
      lobang: 1,
      updatedAt: null,
    },
    userFoodIdentitySnapshots: [],
    kakiFoodIdentitySnapshots: [],
    dailyVisits: [],
    actionEvents: [],
  };
}

function store(): DemoStore {
  if (!globalStore.__jioDemoStore) {
    globalStore.__jioDemoStore = seed();
  }
  return globalStore.__jioDemoStore;
}

/** Test seam: wipe and re-seed. */
export function resetDemoStore(): void {
  globalStore.__jioDemoStore = seed();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayNameFor(userId: string): string {
  const profile = store().profiles.find((p) => p.user_id === userId);
  if (profile) return profile.display_name;
  return `Teammate ${userId.slice(0, 6)}`;
}

/** Mirrors 048_review_likes.sql's recompute_review_like_count trigger. */
function recomputeReviewLikeCount(visitId: string): number {
  const s = store();
  const count = s.reviewLikes.filter((l) => l.visit_id === visitId).length;
  const visit = s.visits.find((v) => v.id === visitId);
  if (visit) visit.like_count = count;
  return count;
}

/** Mirrors 021_place_ratings_trigger.sql's visits_rating_trigger — stamped
 *  on every visit insert/update/delete for a place, regardless of
 *  `is_public`, powering the "Newly rated" sort. */
function stampRatingUpdated(placeId: string): void {
  const place = store().places.find((p) => p.id === placeId);
  if (place) place.rating_updated_at = new Date().toISOString();
}

/**
 * Attach the numbers that are computed rather than stored: distance and walk
 * time from the active office, and the rating aggregates.
 */
function enrich(
  place: Place,
  officeId: string | { lat: number; lng: number } = DEFAULT_OFFICE.id
): Place {
  const s = store();
  const visits = s.visits.filter((v) => v.place_id === place.id);
  const rated = visits.filter((v) => typeof v.rating === "number");

  let walkMinutes: number | undefined;
  let distanceM: number | undefined;

  if (typeof officeId === "string") {
    const cached = s.walkCache.find(
      (w) => w.place_id === place.id && w.office_id === officeId
    );
    walkMinutes = cached?.walk_minutes;
    distanceM = cached?.distance_m;

    if (walkMinutes === undefined) {
      const office = s.offices.find((o) => o.id === officeId) ?? DEFAULT_OFFICE;
      const distance = haversine(office.lat, office.lng, place.lat, place.lng);
      distanceM = Math.round(distance);
      walkMinutes = estimateWalkMinutes(distance);
    }
  } else {
    // An ad-hoc {lat, lng} reference point (Suggest Area Filter spec §4) —
    // never cached, always haversine. Nothing stable to key a cache row on,
    // and it isn't reused across requests.
    const distance = haversine(officeId.lat, officeId.lng, place.lat, place.lng);
    distanceM = Math.round(distance);
    walkMinutes = estimateWalkMinutes(distance);
  }

  return {
    ...place,
    walk_minutes: walkMinutes,
    distance_m: distanceM,
    avg_rating:
      rated.length > 0
        ? rated.reduce((sum, v) => sum + v.rating, 0) / rated.length
        : null,
    visit_count: visits.length,
    has_pending_flag: s.placeFlags.some(
      (f) => f.place_id === place.id && f.status === "pending"
    ),
  };
}

/**
 * Tier 1 scoring for `listAllUsers` — docs/user-discovery.md §4.2. Sum
 * over every Jio `callerId` shared with someone (as host or invitee,
 * either side) of `exp(-daysAgo / halfLife)`. A future-dated Jio (not yet
 * happened) counts at full weight rather than a negative daysAgo blowing
 * the exponential up.
 */
function coAttendanceScores(callerId: string): Map<string, number> {
  const s = store();
  const now = Date.now();
  const halfLifeDays = DISCOVERY_CONFIG.coAttendance.halfLifeDays;
  const scores = new Map<string, number>();

  const myEventIds = new Set<string>();
  for (const e of s.events) {
    if (e.host_id === callerId) myEventIds.add(e.id);
  }
  for (const inv of s.invitees) {
    if (inv.user_id === callerId) myEventIds.add(inv.event_id);
  }

  for (const eventId of myEventIds) {
    const event = s.events.find((e) => e.id === eventId);
    if (!event) continue;

    const daysAgo = (now - new Date(event.scheduled_at).getTime()) / 86400000;
    const weight = Math.exp(-Math.max(0, daysAgo) / halfLifeDays);

    const participants = new Set<string>();
    if (event.host_id !== callerId) participants.add(event.host_id);
    for (const inv of s.invitees) {
      if (inv.event_id === eventId && inv.user_id !== callerId) {
        participants.add(inv.user_id);
      }
    }
    for (const p of participants) {
      scores.set(p, (scores.get(p) ?? 0) + weight);
    }
  }

  return scores;
}

/** Hydrates a lobang for one specific recipient's view (their own seen_at). */
function hydrateReceivedLobang(lobang: Lobang, viewerId: string): Lobang {
  const s = store();
  const place = s.places.find((p) => p.id === lobang.place_id);
  const event = lobang.event_id
    ? s.events.find((e) => e.id === lobang.event_id)
    : undefined;
  const recipient = s.lobangRecipients.find(
    (r) => r.lobang_id === lobang.id && r.user_id === viewerId
  );

  return {
    ...lobang,
    from_display_name: displayNameFor(lobang.from_user_id),
    to_user_id: viewerId,
    to_display_name: displayNameFor(viewerId),
    seen_at: recipient?.seen_at ?? null,
    place: place ? enrich(place) : undefined,
    event_title: event?.title ?? null,
  };
}

/** Hydrates a lobang as the send itself, for the sender's own history. */
function hydrateSentLobang(lobang: Lobang): Lobang {
  const s = store();
  const place = s.places.find((p) => p.id === lobang.place_id);
  const event = lobang.event_id
    ? s.events.find((e) => e.id === lobang.event_id)
    : undefined;
  const recipients = s.lobangRecipients.filter((r) => r.lobang_id === lobang.id);

  let toUserId: string | undefined;
  let toDisplayName: string | undefined;

  if (lobang.kaki_id) {
    const kaki = s.kakis.find((k) => k.id === lobang.kaki_id);
    toDisplayName = kaki?.name ?? "a Kaki";
  } else if (recipients.length === 1) {
    toUserId = recipients[0].user_id;
    toDisplayName = displayNameFor(recipients[0].user_id);
  } else if (recipients.length > 1) {
    toDisplayName = `${recipients.length} teammates`;
  }

  return {
    ...lobang,
    from_display_name: displayNameFor(lobang.from_user_id),
    to_user_id: toUserId,
    to_display_name: toDisplayName,
    place: place ? enrich(place) : undefined,
    event_title: event?.title ?? null,
  };
}

function applyFilters(places: Place[], filters?: Partial<Filters>): Place[] {
  if (!filters) return places;
  let result = places;

  if (filters.status && filters.status !== "all") {
    result = result.filter((p) => p.status === filters.status);
  }
  if (filters.cuisines && filters.cuisines.length > 0) {
    result = result.filter((p) =>
      p.cuisine.some((c) => filters.cuisines!.includes(c))
    );
  }
  if (typeof filters.budgetMin === "number") {
    result = result.filter((p) => p.budget_tier >= filters.budgetMin!);
  }
  if (typeof filters.budgetMax === "number") {
    result = result.filter((p) => p.budget_tier <= filters.budgetMax!);
  }
  if (typeof filters.maxWalkMinutes === "number") {
    result = result.filter(
      (p) =>
        typeof p.walk_minutes !== "number" ||
        p.walk_minutes <= filters.maxWalkMinutes!
    );
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.address || "").toLowerCase().includes(needle) ||
        p.best_dishes.some((d) => d.toLowerCase().includes(needle)) ||
        p.cuisine.some((c) => c.toLowerCase().includes(needle))
    );
  }

  return result;
}

function eventTally(eventId: string): Record<string, number> {
  const s = store();
  const optionIds = s.options
    .filter((o) => o.event_id === eventId)
    .map((o) => o.place_id);
  const votes = s.votes.filter((v) => v.event_id === eventId);

  const tally: Record<string, number> = {};
  for (const id of optionIds) tally[id] = 0;

  const byVoter = new Map<string, EventVote[]>();
  for (const vote of votes) {
    const bucket = byVoter.get(vote.user_id);
    if (bucket) bucket.push(vote);
    else byVoter.set(vote.user_id, [vote]);
  }
  for (const ballot of byVoter.values()) {
    const n = ballot.length;
    for (const vote of ballot) {
      if (vote.place_id in tally) tally[vote.place_id] += n - vote.rank + 1;
    }
  }

  return tally;
}

/**
 * Who is allowed to add a place option to an event.
 *
 * The host always can. Beyond that, membership of the linked kaki or an
 * explicit invite is what grants it — an open event is not a free-for-all.
 */
function canAddOption(event: LunchEvent, userId: string): boolean {
  if (event.host_id === userId) return true;

  const s = store();
  if (event.kaki_id) {
    const isMember = s.kakiMembers.some(
      (m) => m.kaki_id === event.kaki_id && m.user_id === userId
    );
    if (isMember) return true;
  }

  return s.invitees.some(
    (i) => i.event_id === event.id && i.user_id === userId
  );
}

/** Everyone who counts as "coming to this Jio": host, kaki members, invitees. */
function resolveEventParticipants(event: LunchEvent): string[] {
  const s = store();
  const ids = new Set<string>([event.host_id]);

  if (event.kaki_id) {
    for (const member of s.kakiMembers) {
      if (member.kaki_id === event.kaki_id) ids.add(member.user_id);
    }
  }
  for (const invitee of s.invitees) {
    if (invitee.event_id === event.id) ids.add(invitee.user_id);
  }

  return Array.from(ids);
}

/**
 * Part 1 §E — resolves one segment's membership, for `getAdminAnalytics`'s
 * optional `segment` filter. Deliberately a separate, standalone
 * computation rather than a refactor of `getAdminUsersData`'s own segment
 * logic below — that logic already shipped and is tested; duplicating six
 * `if` branches here is cheaper than risking a regression there to share
 * them. Mirrors migration 065's `admin_segment_member_ids` in live mode.
 */
function resolveSegmentMemberIds(
  s: DemoStore,
  days: number,
  segment: string
): Set<string> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const inWindow = (iso?: string | null) => Boolean(iso) && iso! >= cutoff;

  const members = new Set<string>();
  for (const p of s.profiles) {
    const uid = p.user_id;
    const hostedCount = s.events.filter(
      (e) => e.host_id === uid && inWindow(e.created_at)
    ).length;
    const votedCount = new Set(
      s.votes
        .filter((v) => v.user_id === uid && inWindow(v.created_at))
        .map((v) => v.event_id)
    ).size;
    const rsvpCount = s.rsvps.filter((r) => r.user_id === uid).length;
    const visitCount = s.visits.filter(
      (v) => v.user_id === uid && inWindow(v.created_at)
    ).length;
    const reviewCount = s.visits.filter(
      (v) => v.user_id === uid && v.is_public && inWindow(v.created_at)
    ).length;
    const lobangCount = s.lobangs.filter(
      (l) => l.from_user_id === uid && inWindow(l.created_at)
    ).length;
    const activityTimestamps = [
      ...s.events.filter((e) => e.host_id === uid).map((e) => e.created_at),
      ...s.votes.filter((v) => v.user_id === uid).map((v) => v.created_at),
      ...s.visits.filter((v) => v.user_id === uid).map((v) => v.created_at),
      ...s.wishlist.filter((w) => w.user_id === uid).map((w) => w.created_at),
      ...s.lobangs.filter((l) => l.from_user_id === uid).map((l) => l.created_at),
      ...s.placeFlags.filter((f) => f.flagged_by === uid).map((f) => f.created_at),
    ].filter((ts): ts is string => Boolean(ts));
    const lastActiveAt =
      activityTimestamps.length > 0
        ? activityTimestamps.reduce((max, ts) => (ts > max ? ts : max))
        : null;

    let matches = false;
    if (segment === "powerHosts") matches = hostedCount >= 3 && votedCount <= 1;
    else if (segment === "activeVoters") matches = votedCount >= 3 && hostedCount <= 1;
    else if (segment === "rsvpOnlyLurkers")
      matches = rsvpCount >= 3 && votedCount === 0 && hostedCount === 0;
    else if (segment === "reviewers") matches = reviewCount >= 2;
    else if (segment === "dormant")
      matches = !lastActiveAt || lastActiveAt < thirtyDaysAgo;
    else if (segment === "newAndActive")
      matches = Boolean(
        p.created_at &&
          p.created_at >= thirtyDaysAgo &&
          hostedCount + votedCount + visitCount + lobangCount > 0
      );

    if (matches) members.add(uid);
  }
  return members;
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export const demoRepo: Repo = {
  // ---- Places ----

  async listPlaces(filters, pagination) {
    const officeId = filters?.officeId ?? DEFAULT_OFFICE.id;
    const enriched = store().places.map((p) => enrich(p, officeId));
    const filtered = applyFilters(enriched, filters);
    const sorted = sortPlacesForList(filtered, filters?.sortBy);

    if (!pagination) return { places: sorted, total: sorted.length };

    const { limit, offset } = pagination;
    return {
      places: sorted.slice(offset, offset + limit),
      total: sorted.length,
    };
  },

  async getPlace(id) {
    const place = store().places.find((p) => p.id === id);
    return place ? enrich(place) : null;
  },

  async getPublicPlace(id) {
    const found = store().places.find(
      (p) => p.id === id && p.status === "active"
    );
    if (!found) return null;

    // Rating and visit count are computed at read time in demo mode (see
    // `enrich`), not stored on the place row — `getPlace` already goes
    // through it, so this has to as well or the public preview would show
    // a place as unrated even when `getPlace` shows it with a real score.
    const place = enrich(found);
    return {
      id: place.id,
      name: place.name,
      address: place.address ?? null,
      cuisine: place.cuisine,
      custom_cuisine_tags: place.custom_cuisine_tags,
      budget_tier: place.budget_tier,
      best_dishes: place.best_dishes,
      avg_rating: place.avg_rating ?? null,
      visit_count: place.visit_count ?? 0,
      lat: place.lat,
      lng: place.lng,
      google_place_id: place.google_place_id ?? null,
    };
  },

  async createPlace(data) {
    const now = new Date().toISOString();
    const place: Place = {
      ...data,
      id: `demo-place-${uuid().slice(0, 8)}`,
      created_at: now,
      updated_at: now,
      google_place_id: null,
    };
    store().places.push(place);
    return enrich(place);
  },

  async updatePlace(id, data) {
    const s = store();
    const index = s.places.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Place not found");
    // Status moves only through block/unblock/review in live mode — the
    // column grant in 027_place_editing.sql makes it unreachable through a
    // plain update. A guarantee that holds in production but not in demo is
    // worse than none, since demo is the mode people develop against, so
    // strip it here too rather than trust every caller to leave it out.
    // google_place_id is excluded the same way (049_google_place_id.sql) —
    // system-computed, settable only through `setGooglePlaceId`.
    // (office_id isn't a field on Place at all today, so there's nothing to
    // strip for it yet — if a place ever becomes reassignable to a different
    // office, extend this same guard.)
    const { status: _status, google_place_id: _googlePlaceId, ...safeData } = data;
    s.places[index] = {
      ...s.places[index],
      ...safeData,
      id,
      updated_at: new Date().toISOString(),
    };
    return enrich(s.places[index]);
  },

  async setGooglePlaceId(placeId, googlePlaceId) {
    const s = store();
    const place = s.places.find((p) => p.id === placeId);
    if (place) place.google_place_id = googlePlaceId;
  },

  async deletePlace(id) {
    const s = store();
    s.places = s.places.filter((p) => p.id !== id);
    s.visits = s.visits.filter((v) => v.place_id !== id);
    s.wishlist = s.wishlist.filter((w) => w.place_id !== id);
    s.options = s.options.filter((o) => o.place_id !== id);
    s.votes = s.votes.filter((v) => v.place_id !== id);
  },

  // ---- Visits & reviews ----

  async listVisits(placeId, userId) {
    let visits = store().visits;
    if (placeId) visits = visits.filter((v) => v.place_id === placeId);
    if (userId) visits = visits.filter((v) => v.user_id === userId);
    return visits
      .map((v) => ({
        ...v,
        display_name: displayNameFor(v.user_id),
        place_name: store().places.find((p) => p.id === v.place_id)?.name,
      }))
      .sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  },

  async createVisit(data) {
    const visit: Visit = {
      ...data,
      id: `demo-visit-${uuid().slice(0, 8)}`,
      created_at: new Date().toISOString(),
      like_count: 0,
    };
    store().visits.push(visit);
    stampRatingUpdated(visit.place_id);
    return visit;
  },

  async updateVisit(id, userId, patch) {
    const visits = store().visits;
    const index = visits.findIndex((v) => v.id === id);

    // Not-found and not-yours are answered identically on purpose: telling
    // someone a visit exists but is not theirs leaks that they visited.
    if (index === -1 || visits[index].user_id !== userId) {
      throw new Error("That visit is not yours to change");
    }

    // Whitelist, not a spread of `patch`: user_id and place_id must not be
    // reassignable, or an "edit" becomes a way to attribute a review to
    // somebody else.
    const current = visits[index];
    const next: Visit = {
      ...current,
      rating: patch.rating ?? current.rating,
      best_dishes: patch.best_dishes ?? current.best_dishes,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      visited_at: patch.visited_at ?? current.visited_at,
      is_public: patch.is_public ?? current.is_public,
    };

    visits[index] = next;
    stampRatingUpdated(next.place_id);
    return next;
  },

  async deleteVisit(id, userId) {
    const visits = store().visits;
    const index = visits.findIndex((v) => v.id === id);
    if (index === -1 || visits[index].user_id !== userId) {
      throw new Error("That visit is not yours to delete");
    }
    const placeId = visits[index].place_id;
    visits.splice(index, 1);
    stampRatingUpdated(placeId);
  },

  async listPublicReviews(placeId, viewerId) {
    const s = store();
    return s.visits
      .filter((v) => v.place_id === placeId && v.is_public)
      .map((v) => ({
        ...v,
        display_name: displayNameFor(v.user_id),
        liked_by_me: viewerId
          ? s.reviewLikes.some(
              (l) => l.visit_id === v.id && l.user_id === viewerId
            )
          : undefined,
      }))
      .sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  },

  async toggleReviewLike(userId, visitId) {
    const s = store();
    const visit = s.visits.find((v) => v.id === visitId);
    if (!visit) throw new Error("That review does not exist");

    const index = s.reviewLikes.findIndex(
      (l) => l.visit_id === visitId && l.user_id === userId
    );

    if (index === -1) {
      s.reviewLikes.push({
        visit_id: visitId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
      return {
        liked: true,
        like_count: recomputeReviewLikeCount(visitId),
        visit_user_id: visit.user_id,
      };
    }

    s.reviewLikes.splice(index, 1);
    return {
      liked: false,
      like_count: recomputeReviewLikeCount(visitId),
      visit_user_id: visit.user_id,
    };
  },

  async claimReviewLikePushWindow(visitId, windowSeconds = 600) {
    const visit = store().visits.find((v) => v.id === visitId);
    if (!visit) return false;

    const now = Date.now();
    if (
      visit.last_like_push_at &&
      now - new Date(visit.last_like_push_at).getTime() < windowSeconds * 1000
    ) {
      return false;
    }

    visit.last_like_push_at = new Date(now).toISOString();
    return true;
  },

  async listReviewLikesSince(sinceIso) {
    const s = store();
    return s.reviewLikes
      .filter((l) => l.created_at >= sinceIso)
      .map((l) => {
        const visit = s.visits.find((v) => v.id === l.visit_id);
        return {
          visit_id: l.visit_id,
          visit_user_id: visit?.user_id ?? "",
          created_at: l.created_at,
        };
      })
      .filter((l) => l.visit_user_id !== "");
  },

  // ---- Walk cache & offices ----

  async getWalkCache(officeId) {
    return store().walkCache.filter((w) => w.office_id === officeId);
  },

  async upsertWalkCache(entries) {
    const s = store();
    for (const entry of entries) {
      const index = s.walkCache.findIndex(
        (w) => w.office_id === entry.office_id && w.place_id === entry.place_id
      );
      const row = { ...entry, computed_at: new Date().toISOString() };
      if (index === -1) s.walkCache.push(row);
      else s.walkCache[index] = row;
    }
  },

  async listOffices() {
    return [...store().offices];
  },

  async createOffice(data) {
    const office: Office = {
      ...data,
      id: uuid(),
      created_at: new Date().toISOString(),
    };
    store().offices.push(office);
    return office;
  },

  async updateOffice(id, patch) {
    const office = store().offices.find((o) => o.id === id);
    if (!office) throw new Error("That office does not exist");
    Object.assign(office, patch);
    return office;
  },

  async deleteOffice(id) {
    const s = store();
    s.offices = s.offices.filter((o) => o.id !== id);
  },

  // ---- User preferences ----

  async getUserPrefs(userId) {
    return store().prefs.find((p) => p.user_id === userId) ?? null;
  },

  async upsertUserPrefs(prefs) {
    const s = store();
    const index = s.prefs.findIndex((p) => p.user_id === prefs.user_id);
    if (index === -1) s.prefs.push({ ...prefs });
    else s.prefs[index] = { ...s.prefs[index], ...prefs };
    return s.prefs.find((p) => p.user_id === prefs.user_id)!;
  },

  // ---- Profiles ----

  async getProfile(userId) {
    return store().profiles.find((p) => p.user_id === userId) ?? null;
  },

  async upsertProfile(userId, displayName) {
    const s = store();
    const index = s.profiles.findIndex((p) => p.user_id === userId);
    if (index === -1) {
      const profile: Profile = {
        user_id: userId,
        display_name: displayName,
        created_at: new Date().toISOString(),
      };
      s.profiles.push(profile);
      return profile;
    }
    s.profiles[index] = { ...s.profiles[index], display_name: displayName };
    return s.profiles[index];
  },

  async completeOnboarding(userId, displayName) {
    const s = store();
    const index = s.profiles.findIndex((p) => p.user_id === userId);
    const onboardedAt = new Date().toISOString();
    if (index === -1) {
      const profile: Profile = {
        user_id: userId,
        display_name: displayName,
        created_at: onboardedAt,
        onboarded_at: onboardedAt,
      };
      s.profiles.push(profile);
      return profile;
    }
    s.profiles[index] = {
      ...s.profiles[index],
      display_name: displayName,
      onboarded_at: onboardedAt,
    };
    return s.profiles[index];
  },

  async hasSeenDecidedCelebration(userId, eventId) {
    const s = store();
    return s.decidedCelebrationViews.some(
      (v) => v.user_id === userId && v.event_id === eventId
    );
  },

  async markDecidedCelebrationShown(userId, eventId) {
    const s = store();
    if (
      s.decidedCelebrationViews.some(
        (v) => v.user_id === userId && v.event_id === eventId
      )
    ) {
      return;
    }
    s.decidedCelebrationViews.push({
      user_id: userId,
      event_id: eventId,
      shown_at: new Date().toISOString(),
    });
  },

  async hasMatchingKakiForParticipants(hostId, participantIds) {
    const s = store();
    const targetSet = new Set(participantIds);
    const hostKakiIds = new Set(
      s.kakiMembers.filter((m) => m.user_id === hostId).map((m) => m.kaki_id)
    );
    for (const kakiId of hostKakiIds) {
      const memberSet = new Set(
        s.kakiMembers.filter((m) => m.kaki_id === kakiId).map((m) => m.user_id)
      );
      if (
        memberSet.size === targetSet.size &&
        Array.from(memberSet).every((id) => targetSet.has(id))
      ) {
        return true;
      }
    }
    return false;
  },

  async hasDismissedKakiBridgeSuggestion(userId, eventId) {
    const s = store();
    return s.kakiBridgeDismissals.some(
      (v) => v.user_id === userId && v.event_id === eventId
    );
  },

  async dismissKakiBridgeSuggestion(userId, eventId) {
    const s = store();
    if (
      s.kakiBridgeDismissals.some(
        (v) => v.user_id === userId && v.event_id === eventId
      )
    ) {
      return;
    }
    s.kakiBridgeDismissals.push({
      user_id: userId,
      event_id: eventId,
      dismissed_at: new Date().toISOString(),
    });
  },

  async getDisplayNames(userIds) {
    const map = new Map<string, string>();
    for (const id of userIds) map.set(id, displayNameFor(id));
    return map;
  },

  async savePushSubscription(userId, sub) {
    const s = store();
    const index = s.pushSubscriptions.findIndex(
      (p) => p.endpoint === sub.endpoint
    );
    const row = {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth_key: sub.authKey,
    };
    if (index === -1) s.pushSubscriptions.push(row);
    else s.pushSubscriptions[index] = row;
  },

  async deletePushSubscription(endpoint) {
    const s = store();
    s.pushSubscriptions = s.pushSubscriptions.filter(
      (p) => p.endpoint !== endpoint
    );
  },

  async setNotifyEvents(userId, enabled) {
    const s = store();
    const profile = s.profiles.find((p) => p.user_id === userId);
    if (profile) profile.notify_events = enabled;
  },

  async setNotifyAdminReports(userId, enabled) {
    const s = store();
    const profile = s.profiles.find((p) => p.user_id === userId);
    if (profile) profile.notify_admin_reports = enabled;
  },

  async getPushTargets(userIds): Promise<PushTarget[]> {
    const s = store();
    const ids = new Set(userIds);
    return s.pushSubscriptions
      .filter((p) => ids.has(p.user_id))
      .filter((p) => {
        const profile = s.profiles.find((pr) => pr.user_id === p.user_id);
        // Undefined means the demo profile predates this preference —
        // default on, matching the column's own DB default.
        return profile?.notify_events !== false;
      })
      .map((p) => ({
        userId: p.user_id,
        endpoint: p.endpoint,
        p256dh: p.p256dh,
        authKey: p.auth_key,
      }));
  },

  async listAllUsers(callerId, query, officeId, includeIds) {
    const s = store();
    const ids = new Set<string>([
      DEMO_USER_ID,
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_B,
      ...s.profiles.map((p) => p.user_id),
    ]);
    ids.delete(callerId);

    let candidates: TeamUser[] = Array.from(ids).map((id) => ({
      user_id: id,
      display_name: displayNameFor(id),
    }));

    if (officeId) {
      candidates = candidates.filter((u) => {
        const prefsOffice = s.prefs.find((p) => p.user_id === u.user_id)
          ?.default_office_id;
        return (prefsOffice ?? DEFAULT_OFFICE.id) === officeId;
      });
    }

    const includeSet = new Set(includeIds ?? []);
    const q = query?.trim().toLowerCase();
    if (q) {
      candidates = candidates.filter(
        (u) => u.display_name.toLowerCase().includes(q) || includeSet.has(u.user_id)
      );
    }

    // §4.2's three tiers. Tier 1: co-attendance score > 0. Tier 2: a
    // current Kaki co-member not already in tier 1, tagged with the
    // earliest (alphabetically) shared Kaki's name for sort purposes.
    // Tier 3: everyone else — included only while actually searching.
    const scores = coAttendanceScores(callerId);
    const callerKakiIds = new Set(
      s.kakiMembers.filter((m) => m.user_id === callerId).map((m) => m.kaki_id)
    );
    const kakiNames = new Map(s.kakis.map((k) => [k.id, k.name] as const));
    const tier2KakiName = new Map<string, string>();
    for (const m of s.kakiMembers) {
      if (m.user_id === callerId) continue;
      if (!callerKakiIds.has(m.kaki_id)) continue;
      if ((scores.get(m.user_id) ?? 0) > 0) continue;
      const name = kakiNames.get(m.kaki_id);
      if (!name) continue;
      const existing = tier2KakiName.get(m.user_id);
      if (!existing || name.localeCompare(existing) < 0) {
        tier2KakiName.set(m.user_id, name);
      }
    }

    const tierOf = (userId: string): 1 | 2 | 3 => {
      if ((scores.get(userId) ?? 0) > 0) return 1;
      if (tier2KakiName.has(userId)) return 2;
      return 3;
    };

    const visible = q
      ? candidates
      : candidates.filter(
          (c) => tierOf(c.user_id) !== 3 || includeSet.has(c.user_id)
        );

    return visible.sort((a, b) => {
      const ta = tierOf(a.user_id);
      const tb = tierOf(b.user_id);
      if (ta !== tb) return ta - tb;
      if (ta === 1) return (scores.get(b.user_id) ?? 0) - (scores.get(a.user_id) ?? 0);
      if (ta === 2) {
        const byKaki = (tier2KakiName.get(a.user_id) ?? "").localeCompare(
          tier2KakiName.get(b.user_id) ?? ""
        );
        if (byKaki !== 0) return byKaki;
      }
      return a.display_name.localeCompare(b.display_name);
    });
  },

  // ---- Lunch events ----

  async createEvent(
    hostId,
    title,
    scheduledAt,
    officeId,
    placeIds,
    kakiId,
    inviteeIds,
    hideVotes
  ) {
    const s = store();
    const event: LunchEvent = {
      id: `demo-event-${uuid().slice(0, 8)}`,
      office_id: officeId,
      host_id: hostId,
      title,
      scheduled_at: scheduledAt,
      status: "open",
      invite_token: generateToken(),
      winner_place_id: null,
      kaki_id: kakiId ?? null,
      hide_votes: hideVotes ?? false,
      created_at: new Date().toISOString(),
    };
    s.events.push(event);

    for (const placeId of placeIds) {
      s.options.push({
        event_id: event.id,
        place_id: placeId,
        added_by: hostId,
        is_suggested: false,
      });
    }

    for (const userId of inviteeIds ?? []) {
      if (userId === hostId) continue;
      s.invitees.push({ event_id: event.id, user_id: userId });
    }

    return event;
  },

  async createFlexiEvent(
    hostId,
    title,
    officeId,
    candidateDates,
    kakiId,
    inviteeIds,
    hideVotes,
    timeOfDay
  ) {
    const uniqueDates = Array.from(new Set(candidateDates));
    if (uniqueDates.length < 2) {
      throw new Error("A Flexi Jio needs at least 2 candidate dates");
    }

    const s = store();
    const earliest = [...uniqueDates].sort()[0];
    // A bare "YYYY-MM-DD" always parses as UTC midnight — 8am once
    // formatted in Singapore time. An explicit +08:00 offset on a real
    // (host-chosen, or noon-default) time avoids that entirely.
    const scheduledAt = new Date(
      `${earliest}T${timeOfDay || "12:00"}+08:00`
    ).toISOString();
    const event: LunchEvent = {
      id: `demo-event-${uuid().slice(0, 8)}`,
      office_id: officeId,
      host_id: hostId,
      title,
      scheduled_at: scheduledAt,
      status: "open",
      invite_token: generateToken(),
      winner_place_id: null,
      kaki_id: kakiId ?? null,
      hide_votes: hideVotes ?? false,
      date_phase: "polling",
      created_at: new Date().toISOString(),
    };
    s.events.push(event);

    for (const date of uniqueDates) {
      s.candidateDates.push({
        event_id: event.id,
        date,
        added_by: hostId,
        created_at: new Date().toISOString(),
      });
    }

    for (const userId of inviteeIds ?? []) {
      if (userId === hostId) continue;
      s.invitees.push({ event_id: event.id, user_id: userId });
    }

    return event;
  },

  async getEvent(idOrToken) {
    const s = store();
    const event = s.events.find(
      (e) => e.id === idOrToken || e.invite_token === idOrToken
    );
    if (!event) return null;

    const options: EventOption[] = s.options
      .filter((o) => o.event_id === event.id)
      .map((o) => ({
        ...o,
        place: s.places.find((p) => p.id === o.place_id)
          ? enrich(s.places.find((p) => p.id === o.place_id)!, event.office_id)
          : undefined,
        added_by_name: displayNameFor(o.added_by),
      }));

    const rsvps: EventRsvp[] = s.rsvps
      .filter((r) => r.event_id === event.id)
      .map((r) => ({ ...r, display_name: displayNameFor(r.user_id) }));

    const invitees: EventInvitee[] = s.invitees
      .filter((i) => i.event_id === event.id)
      .map((i) => ({ ...i, display_name: displayNameFor(i.user_id) }));

    const candidateDates: EventCandidateDate[] = s.candidateDates
      .filter((d) => d.event_id === event.id)
      .map((d) => ({ ...d, added_by_name: displayNameFor(d.added_by) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dateVotes: EventDateVote[] = s.dateVotes
      .filter((v) => v.event_id === event.id)
      .map((v) => ({ ...v, display_name: displayNameFor(v.user_id) }));

    return {
      ...event,
      host_name: displayNameFor(event.host_id),
      option_count: options.length,
      going_count: rsvps.filter((r) => r.response === "yes").length,
      winner_place_name: event.winner_place_id
        ? s.places.find((p) => p.id === event.winner_place_id)?.name ?? null
        : null,
      winner_place: event.winner_place_id
        ? (() => {
            const place = s.places.find((p) => p.id === event.winner_place_id);
            return place ? enrich(place, event.office_id) : null;
          })()
        : null,
      winner_label:
        event.winner_place_id &&
        !s.places.find((p) => p.id === event.winner_place_id)
          ? (s.options.find(
              (o) => o.event_id === event.id && o.place_id === event.winner_place_id
            )?.label ?? null)
          : null,
      options,
      votes: s.votes.filter((v) => v.event_id === event.id),
      rsvps,
      invitees,
      candidateDates,
      dateVotes,
      tally: eventTally(event.id),
    };
  },

  async getPublicEventPreview(token) {
    const s = store();
    // Resolved by invite_token only, never a raw id — this is reachable
    // with no session at all, unlike getEvent above.
    const event = s.events.find((e) => e.invite_token === token);
    if (!event) return null;

    const goingCount = s.rsvps.filter(
      (r) => r.event_id === event.id && r.response === "yes"
    ).length;

    const placeOptions = s.options
      .filter((o) => o.event_id === event.id)
      .map((o) => {
        const place = s.places.find((p) => p.id === o.place_id);
        return { id: o.place_id, name: place?.name ?? o.label ?? "A place" };
      });

    // UX review log #25 — same derivation `getEvent` uses just above: a
    // real place's name if `winner_place_id` matches one, else the
    // free-text option's own label if it doesn't (a placeless winner).
    const winnerPlaceName =
      event.status === "closed" && event.winner_place_id
        ? (s.places.find((p) => p.id === event.winner_place_id)?.name ??
          s.options.find(
            (o) => o.event_id === event.id && o.place_id === event.winner_place_id
          )?.label ??
          null)
        : null;

    return {
      title: event.title,
      hostName: displayNameFor(event.host_id),
      scheduledAt: event.scheduled_at,
      datePhase: event.date_phase ?? null,
      status: event.status,
      goingCount,
      placeOptions,
      winnerPlaceName,
    };
  },

  async listEvents(userId) {
    const s = store();

    const kakiIds = new Set(
      s.kakiMembers.filter((m) => m.user_id === userId).map((m) => m.kaki_id)
    );
    const invitedTo = new Set(
      s.invitees.filter((i) => i.user_id === userId).map((i) => i.event_id)
    );
    const votedOn = new Set(
      s.votes.filter((v) => v.user_id === userId).map((v) => v.event_id)
    );
    const rsvpdTo = new Set(
      s.rsvps.filter((r) => r.user_id === userId).map((r) => r.event_id)
    );

    return s.events
      .filter(
        (e) =>
          e.host_id === userId ||
          (e.kaki_id && kakiIds.has(e.kaki_id)) ||
          invitedTo.has(e.id) ||
          votedOn.has(e.id) ||
          rsvpdTo.has(e.id)
      )
      .map((e) => ({
        ...e,
        host_name: displayNameFor(e.host_id),
        option_count: s.options.filter((o) => o.event_id === e.id).length,
        going_count: s.rsvps.filter(
          (r) => r.event_id === e.id && r.response === "yes"
        ).length,
        winner_place_name: e.winner_place_id
          ? s.places.find((p) => p.id === e.winner_place_id)?.name ?? null
          : null,
        winner_label:
          e.winner_place_id && !s.places.find((p) => p.id === e.winner_place_id)
            ? (s.options.find(
                (o) => o.event_id === e.id && o.place_id === e.winner_place_id
              )?.label ?? null)
            : null,
        has_marked_availability: s.dateVotes.some(
          (v) => v.event_id === e.id && v.user_id === userId
        ),
      }))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  async addInviteesToEvent(eventId, userIds, hostId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.host_id !== hostId) {
      throw new Error("Only the host can invite people");
    }
    for (const userId of userIds) {
      if (userId === event.host_id) continue;
      const exists = s.invitees.some(
        (i) => i.event_id === eventId && i.user_id === userId
      );
      if (!exists) s.invitees.push({ event_id: eventId, user_id: userId });
    }
  },

  async removeInviteeFromEvent(eventId, userId, hostId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.host_id !== hostId) {
      throw new Error("Only the host can remove people");
    }
    if (userId === event.host_id) {
      throw new Error("The host can't be removed");
    }

    s.invitees = s.invitees.filter(
      (i) => !(i.event_id === eventId && i.user_id === userId)
    );
    // Their RSVP, ballot and any Flexi date-availability would otherwise
    // linger for someone no longer part of the Jio, skewing counts nobody
    // can now attribute to them. Anything they added (an option, a
    // candidate date) stays — that's still useful to everyone else.
    s.rsvps = s.rsvps.filter(
      (r) => !(r.event_id === eventId && r.user_id === userId)
    );
    s.votes = s.votes.filter(
      (v) => !(v.event_id === eventId && v.user_id === userId)
    );
    s.dateVotes = s.dateVotes.filter(
      (v) => !(v.event_id === eventId && v.user_id === userId)
    );
  },

  async joinEventViaInvite(eventId, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.host_id === userId) return;

    const exists = s.invitees.some(
      (i) => i.event_id === eventId && i.user_id === userId
    );
    if (!exists) s.invitees.push({ event_id: eventId, user_id: userId });
  },

  async addOptionToEvent(eventId, placeId, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.status !== "open") throw new Error("This Jio is already closed");

    if (!canAddOption(event, userId)) {
      throw new Error("Only the host, kaki members or invitees can add places");
    }

    const place = s.places.find((p) => p.id === placeId);
    if (!place) throw new Error("Place not found");

    const exists = s.options.some(
      (o) => o.event_id === eventId && o.place_id === placeId
    );
    if (exists) throw new Error("That place is already an option");

    s.options.push({
      event_id: eventId,
      place_id: placeId,
      added_by: userId,
      is_suggested: false,
    });
  },

  async addFreeTextOptionToEvent(eventId, label, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.status !== "open") throw new Error("This Jio is already closed");

    if (!canAddOption(event, userId)) {
      throw new Error("Only the host, kaki members or invitees can add places");
    }

    const trimmed = label.trim();
    if (!trimmed) throw new Error("Give it a name");

    // No `places` row exists yet, so this id is generated rather than
    // looked up — it never matches a real place, which is exactly what
    // makes `place` undefined when this option is rendered. See the
    // `place_id` doc comment on EventOption for why this is safe to vote on
    // through the same column real places use. No string prefix — mirrors
    // supabaseRepo.ts / migration 032, place_id is a bare generated uuid.
    const placeId = uuid();
    const option: EventOption = {
      event_id: eventId,
      place_id: placeId,
      added_by: userId,
      is_suggested: false,
      label: trimmed,
    };
    s.options.push(option);
    return { ...option, added_by_name: displayNameFor(userId) };
  },

  async attachPlaceToOption(eventId, oldPlaceId, newPlaceId, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");

    const option = s.options.find(
      (o) => o.event_id === eventId && o.place_id === oldPlaceId
    );
    if (!option) throw new Error("That option does not exist");
    if (option.label == null) {
      throw new Error("That option is already a real place");
    }

    // CHANGES_20260819d.md §1 — widened from host/adder-only so anyone who
    // can already see this Jio's ballot (host, kaki member, invitee) can
    // help register one of its free-text options as a real place, not just
    // whoever happened to type it in. Mirrors migration 056's Postgres
    // function.
    if (!canAddOption(event, userId)) {
      throw new Error("Only the host, kaki members or invitees can add places");
    }

    const place = s.places.find((p) => p.id === newPlaceId);
    if (!place) throw new Error("That place does not exist");

    option.place_id = newPlaceId;
    option.label = null;

    // Votes already cast for the draft option move with it, so ranking
    // "abc house" before it became a real place is not silently discarded
    // the moment someone attaches one. A voter who — vanishingly rarely —
    // had *also* separately ranked the same real place keeps that vote and
    // loses the now-duplicate one, rather than erroring the whole attach.
    for (const vote of s.votes) {
      if (vote.event_id !== eventId || vote.place_id !== oldPlaceId) continue;
      const collides = s.votes.some(
        (v) =>
          v.event_id === eventId &&
          v.user_id === vote.user_id &&
          v.place_id === newPlaceId
      );
      if (collides) continue;
      vote.place_id = newPlaceId;
    }
    s.votes = s.votes.filter(
      (v) => !(v.event_id === eventId && v.place_id === oldPlaceId)
    );

    if (event.winner_place_id === oldPlaceId) {
      event.winner_place_id = newPlaceId;
    }
  },

  async removeOptionFromEvent(eventId, placeId, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.status !== "open") throw new Error("This Jio is already closed");

    const option = s.options.find(
      (o) => o.event_id === eventId && o.place_id === placeId
    );
    if (!option) throw new Error("That place is not an option");

    if (event.host_id !== userId && option.added_by !== userId) {
      throw new Error("Only the host or whoever added it can remove a place");
    }

    s.options = s.options.filter(
      (o) => !(o.event_id === eventId && o.place_id === placeId)
    );
    // Ballots that referenced the removed option would otherwise skew the count.
    s.votes = s.votes.filter(
      (v) => !(v.event_id === eventId && v.place_id === placeId)
    );
  },

  async suggestOptionsForEvent(eventId, userId, excludePlaceIds = []) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.status !== "open") throw new Error("This Jio is already closed");
    if (!canAddOption(event, userId)) {
      throw new Error("Only the host, kaki members or invitees can add places");
    }

    // A re-roll replaces any earlier suggestion nobody's voted on yet;
    // anything that already has a vote stays untouched.
    const votedPlaceIds = new Set(
      s.votes.filter((v) => v.event_id === eventId).map((v) => v.place_id)
    );
    s.options = s.options.filter(
      (o) =>
        !(
          o.event_id === eventId &&
          o.is_suggested &&
          !votedPlaceIds.has(o.place_id)
        )
    );

    const participantIds = resolveEventParticipants(event);
    const respondedYesOrMaybe = new Set(
      s.rsvps
        .filter(
          (r) =>
            r.event_id === eventId &&
            participantIds.includes(r.user_id) &&
            (r.response === "yes" || r.response === "maybe")
        )
        .map((r) => r.user_id)
    );
    const scopedIds =
      respondedYesOrMaybe.size > 0
        ? Array.from(respondedYesOrMaybe)
        : participantIds;

    const membersData: MemberData[] = scopedIds.map((uid) => ({
      userId: uid,
      visits: s.visits.filter((v) => v.user_id === uid),
      prefs: s.prefs.find((p) => p.user_id === uid) ?? null,
      wishlistPlaceIds: s.wishlist
        .filter((w) => w.user_id === uid)
        .map((w) => w.place_id),
    }));

    const places = s.places
      .filter((p) => p.status === "active")
      .map((p) => enrich(p, event.office_id));

    const currentOptionIds = new Set(
      s.options.filter((o) => o.event_id === eventId).map((o) => o.place_id)
    );
    const exclude = new Set([...currentOptionIds, ...excludePlaceIds]);

    const picks = pickCommitteeSuggestions(places, membersData, exclude);

    const added: EventOption[] = [];
    for (const pick of picks) {
      const option: EventOption = {
        event_id: eventId,
        place_id: pick.place.id,
        added_by: userId,
        is_suggested: true,
      };
      s.options.push(option);
      added.push({
        ...option,
        place: pick.place,
        added_by_name: displayNameFor(userId),
      });
    }

    return added;
  },

  async castBallot(eventId, userId, rankedPlaceIds) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.status !== "open") throw new Error("This Jio is already closed");

    const optionIds = new Set(
      s.options.filter((o) => o.event_id === eventId).map((o) => o.place_id)
    );

    // A ballot replaces any previous one from the same voter.
    s.votes = s.votes.filter(
      (v) => !(v.event_id === eventId && v.user_id === userId)
    );

    rankedPlaceIds.forEach((placeId, index) => {
      if (!optionIds.has(placeId)) return;
      s.votes.push({
        event_id: eventId,
        user_id: userId,
        place_id: placeId,
        rank: index + 1,
        created_at: new Date().toISOString(),
      });
    });
  },

  async addCandidateDate(eventId, date, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.status !== "open") throw new Error("This Jio is already closed");
    if (event.date_phase !== "polling") {
      throw new Error("This Jio's date is already confirmed");
    }
    if (!canAddOption(event, userId)) {
      throw new Error("Only the host, kaki members or invitees can add dates");
    }

    const exists = s.candidateDates.some(
      (d) => d.event_id === eventId && d.date === date
    );
    if (exists) throw new Error("That date is already a candidate");

    s.candidateDates.push({
      event_id: eventId,
      date,
      added_by: userId,
      created_at: new Date().toISOString(),
    });
  },

  async markDateAvailability(eventId, userId, dates) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.date_phase !== "polling") {
      throw new Error("This Jio's date is already confirmed");
    }

    const validDates = new Set(
      s.candidateDates
        .filter((d) => d.event_id === eventId)
        .map((d) => d.date)
    );

    // Marking availability fully replaces the prior selection.
    s.dateVotes = s.dateVotes.filter(
      (v) => !(v.event_id === eventId && v.user_id === userId)
    );

    for (const date of dates) {
      if (!validDates.has(date)) continue;
      s.dateVotes.push({
        event_id: eventId,
        user_id: userId,
        date,
        created_at: new Date().toISOString(),
      });
    }
  },

  async confirmEventDate(eventId, hostId, date) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Can't find that Jio — the link might be old.");
    const event = s.events[index];

    if (event.host_id !== hostId) {
      throw new Error("Only the host can confirm the date");
    }
    if (event.date_phase !== "polling") {
      throw new Error("This Jio's date is already confirmed");
    }

    const isCandidate = s.candidateDates.some(
      (d) => d.event_id === eventId && d.date === date
    );
    if (!isCandidate) throw new Error("That date was never a candidate");

    // Carries the time-of-day the host originally set at creation onto
    // whichever candidate date actually gets confirmed — same explicit
    // +08:00 offset construction as createFlexiEvent, not a bare date
    // string (which parses as UTC midnight, 8am once shown in SGT).
    const timeOfDay = sgtTimeOfDay(event.scheduled_at);
    s.events[index] = {
      ...event,
      scheduled_at: new Date(`${date}T${timeOfDay}+08:00`).toISOString(),
      date_phase: "confirmed",
    };

    return s.events[index];
  },

  async rsvp(eventId, userId, response) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");

    const index = s.rsvps.findIndex(
      (r) => r.event_id === eventId && r.user_id === userId
    );
    if (index === -1) {
      s.rsvps.push({ event_id: eventId, user_id: userId, response });
    } else {
      s.rsvps[index] = { ...s.rsvps[index], response };
    }
  },

  async closeEvent(eventId, hostId, winnerPlaceId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Can't find that Jio — the link might be old.");
    if (event.host_id !== hostId) {
      throw new Error("Only the host can close this Jio");
    }

    const optionIds = s.options
      .filter((o) => o.event_id === eventId)
      .map((o) => o.place_id);

    // An explicit winner (a roulette spin, or the host overruling) wins;
    // otherwise the ballots decide.
    let winner = winnerPlaceId ?? null;
    if (!winner) {
      const votes = s.votes.filter((v) => v.event_id === eventId);
      winner = computeWinner(votes, optionIds).winnerId;
    }

    const index = s.events.findIndex((e) => e.id === eventId);
    s.events[index] = {
      ...event,
      status: "closed",
      winner_place_id: winner,
      closed_at: new Date().toISOString(),
    };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("That Jio vanished while closing");
    return detail;
  },

  async claimVotePushWindow(eventId, windowSeconds = 600) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) return false;

    const now = Date.now();
    if (
      event.last_vote_push_at &&
      now - new Date(event.last_vote_push_at).getTime() < windowSeconds * 1000
    ) {
      return false;
    }

    event.last_vote_push_at = new Date(now).toISOString();
    return true;
  },

  async remindDueEvents(userId) {
    const REMINDER_WINDOW_MS = 30 * 60 * 1000;
    const s = store();
    const now = Date.now();

    const events = await demoRepo.listEvents(userId);
    const due = events.filter((e) => {
      if (e.status !== "open" || e.date_phase === "polling") return false;
      if (e.reminder_sent_at) return false;
      const msAway = new Date(e.scheduled_at).getTime() - now;
      return msAway > 0 && msAway <= REMINDER_WINDOW_MS;
    });

    const results: Array<{ eventId: string; title: string; recipientIds: string[] }> = [];

    for (const summary of due) {
      const event = s.events.find((e) => e.id === summary.id);
      if (!event || event.reminder_sent_at) continue;
      event.reminder_sent_at = new Date(now).toISOString();

      const participants = resolveEventParticipants(event);
      const responded = new Set<string>([
        ...s.votes.filter((v) => v.event_id === event.id).map((v) => v.user_id),
        ...s.rsvps.filter((r) => r.event_id === event.id).map((r) => r.user_id),
      ]);
      const recipientIds = participants.filter((id) => !responded.has(id));
      if (recipientIds.length > 0) {
        results.push({ eventId: event.id, title: event.title, recipientIds });
      }
    }

    return results;
  },

  async getEventReminderOverride(eventId, userId) {
    const s = store();
    const row = s.eventReminders.find(
      (r) => r.event_id === eventId && r.user_id === userId
    );
    return row?.lead_minutes ?? null;
  },

  async setEventReminderOverride(eventId, userId, leadMinutes) {
    const s = store();
    const index = s.eventReminders.findIndex(
      (r) => r.event_id === eventId && r.user_id === userId
    );
    if (index === -1) {
      s.eventReminders.push({
        event_id: eventId,
        user_id: userId,
        lead_minutes: leadMinutes,
        sent_at: null,
      });
    } else {
      s.eventReminders[index] = {
        ...s.eventReminders[index],
        lead_minutes: leadMinutes,
      };
    }
  },

  async listAndClaimDueReminders() {
    const s = store();
    const now = Date.now();

    const candidates = s.rsvps.filter((r) => r.response === "yes");
    const results: Array<{
      eventId: string;
      userId: string;
      title: string;
      scheduledAt: string;
    }> = [];

    for (const { event_id: eventId, user_id: userId } of candidates) {
      const event = s.events.find((e) => e.id === eventId);
      if (!event || event.status === "cancelled") continue;
      if (new Date(event.scheduled_at).getTime() <= now) continue;

      let stateIndex = s.eventReminders.findIndex(
        (r) => r.event_id === eventId && r.user_id === userId
      );
      if (stateIndex !== -1 && s.eventReminders[stateIndex].sent_at) continue;

      const prefs = s.prefs.find((p) => p.user_id === userId);
      // A missing prefs row means nobody has ever touched their
      // preferences — the same defaults the migration's column defaults
      // give everyone else, not a reason to skip them.
      const remindersEnabled = prefs?.reminders_enabled ?? true;
      if (!remindersEnabled) continue;

      const leadMinutes =
        (stateIndex !== -1 ? s.eventReminders[stateIndex].lead_minutes : null) ??
        prefs?.reminder_lead_minutes ??
        30;

      const dueAt = new Date(event.scheduled_at).getTime() - leadMinutes * 60_000;
      if (dueAt > now) continue;

      const sentAt = new Date(now).toISOString();
      if (stateIndex === -1) {
        s.eventReminders.push({
          event_id: eventId,
          user_id: userId,
          lead_minutes: null,
          sent_at: sentAt,
        });
      } else {
        s.eventReminders[stateIndex] = {
          ...s.eventReminders[stateIndex],
          sent_at: sentAt,
        };
      }

      results.push({
        eventId,
        userId,
        title: event.title,
        scheduledAt: event.scheduled_at,
      });
    }

    return results;
  },

  async cancelEvent(eventId, hostId) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Can't find that Jio — the link might be old.");
    const event = s.events[index];

    if (event.host_id !== hostId) {
      throw new Error("Only the host can cancel this Jio");
    }
    if (event.status === "cancelled") {
      throw new Error("This Jio is already cancelled");
    }
    if (event.status === "closed") {
      throw new Error("This Jio is already closed");
    }

    s.events[index] = { ...event, status: "cancelled" };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("That Jio vanished while cancelling");
    return detail;
  },

  async rescheduleEvent(eventId, hostId, newScheduledAt) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Can't find that Jio — the link might be old.");
    const event = s.events[index];

    if (event.host_id !== hostId) {
      throw new Error("Only the host can change the date");
    }
    if (event.status === "cancelled") {
      throw new Error("A cancelled Jio has nothing to reschedule");
    }

    s.events[index] = {
      ...event,
      scheduled_at: newScheduledAt,
      // Typing a date/time directly finalizes a still-polling Flexi Jio
      // the same way confirming a candidate does — just not restricted to
      // the pre-listed candidates.
      date_phase:
        event.date_phase === "polling" ? "confirmed" : event.date_phase,
    };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("That Jio vanished while rescheduling");
    return detail;
  },

  async editEventWinner(eventId, hostId, newPlaceId) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Can't find that Jio — the link might be old.");
    const event = s.events[index];

    if (event.host_id !== hostId) {
      throw new Error("Only the host can correct where this Jio went");
    }
    if (event.status !== "closed") {
      throw new Error("Only a closed Jio's result can be corrected");
    }
    if (!s.places.some((p) => p.id === newPlaceId)) {
      throw new Error("That place does not exist");
    }

    s.events[index] = { ...event, winner_place_id: newPlaceId };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("That Jio vanished while correcting it");
    return detail;
  },

  async setHideVotes(eventId, hostId, hideVotes) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Can't find that Jio — the link might be old.");
    const event = s.events[index];

    if (event.host_id !== hostId) {
      throw new Error("Only the host can change whether the votes are hidden");
    }
    if (event.status !== "open") {
      throw new Error("There's nothing to hide or reveal once this Jio isn't open");
    }

    s.events[index] = { ...event, hide_votes: hideVotes };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("That Jio vanished while changing hide_votes");
    return detail;
  },

  async reopenEvent(eventId, hostId) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Can't find that Jio — the link might be old.");
    const event = s.events[index];

    if (event.host_id !== hostId) {
      throw new Error("Only the host can reopen this Jio for voting");
    }
    if (event.status !== "closed") {
      throw new Error("Only a closed Jio can be reopened for voting");
    }
    if (new Date(event.scheduled_at).getTime() <= Date.now()) {
      throw new Error("Can't reopen voting for a Jio that's already happened");
    }

    s.events[index] = {
      ...event,
      status: "open",
      winner_place_id: null,
      closed_at: null,
    };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("That Jio vanished while reopening it");
    return detail;
  },

  async maybeAutoCloseEvent(eventId) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) return null;
    const event = s.events[index];

    if (event.status !== "open") return null;
    if (event.date_phase === "polling") return null;

    const participants = resolveEventParticipants(event);
    const rsvpByUser = new Map(
      s.rsvps
        .filter((r) => r.event_id === eventId)
        .map((r) => [r.user_id, r.response])
    );

    // Every participant must have confirmed or declined — "maybe", or no
    // response at all, both leave this Jio open, same as a still-silent
    // invitee would.
    for (const userId of participants) {
      const response = rsvpByUser.get(userId);
      if (response !== "yes" && response !== "no") return null;
    }

    // Everyone who confirmed going must have actually voted.
    const votedUserIds = new Set(
      s.votes.filter((v) => v.event_id === eventId).map((v) => v.user_id)
    );
    for (const userId of participants) {
      if (rsvpByUser.get(userId) === "yes" && !votedUserIds.has(userId)) {
        return null;
      }
    }

    const optionIds = s.options
      .filter((o) => o.event_id === eventId)
      .map((o) => o.place_id);
    const votes = s.votes.filter((v) => v.event_id === eventId);
    const winner = computeWinner(votes, optionIds).winnerId;

    s.events[index] = {
      ...event,
      status: "closed",
      winner_place_id: winner,
      closed_at: new Date().toISOString(),
    };

    return demoRepo.getEvent(eventId);
  },

  // ---- Recurring series ----

  async createRecurringSeries(data) {
    const s = store();
    const series: RecurringSeries = {
      ...data,
      id: `demo-series-${uuid().slice(0, 8)}`,
      status: "active",
      last_generated_date: null,
      created_at: new Date().toISOString(),
    };
    s.recurringSeries.push(series);
    return series;
  },

  async listRecurringSeries(hostId) {
    const s = store();
    return s.recurringSeries
      .filter((series) => series.host_id === hostId)
      .map((series) => ({
        ...series,
        fixed_place_name: series.fixed_place_id
          ? (s.places.find((p) => p.id === series.fixed_place_id)?.name ?? null)
          : null,
      }));
  },

  async cancelRecurringSeries(seriesId, hostId) {
    const s = store();
    const series = s.recurringSeries.find((sr) => sr.id === seriesId);
    if (!series) throw new Error("Series not found");
    if (series.host_id !== hostId) {
      throw new Error("Only the host can cancel this series");
    }
    series.status = "cancelled";
  },

  async updateRecurringSeries(seriesId, hostId, updates) {
    const s = store();
    const series = s.recurringSeries.find((sr) => sr.id === seriesId);
    if (!series) throw new Error("Series not found");
    if (series.host_id !== hostId) {
      throw new Error("Only the host can edit this series");
    }

    const nextMode = updates.mode ?? series.mode;
    Object.assign(series, {
      title: updates.title ?? series.title,
      weekday: updates.weekday ?? series.weekday,
      time_of_day: updates.time_of_day ?? series.time_of_day,
      mode: nextMode,
      fixed_place_id:
        nextMode === "fixed"
          ? (updates.fixed_place_id ?? series.fixed_place_id)
          : null,
      option_place_ids:
        nextMode === "vote"
          ? (updates.option_place_ids ?? series.option_place_ids)
          : [],
      invitee_ids: updates.invitee_ids ?? series.invitee_ids,
      kaki_id:
        updates.kaki_id !== undefined ? updates.kaki_id : series.kaki_id,
    });

    // Propagate onto any already-generated occurrence that's still `open`
    // — "any Jio not confirmed yet, if pending, should also change."
    const openOccurrences = s.events.filter(
      (e) => e.recurring_series_id === seriesId && e.status === "open"
    );
    for (const occurrence of openOccurrences) {
      // Time-of-day always propagates; the weekday never moves an
      // occurrence that's already generated — its calendar date is fixed.
      if (updates.time_of_day !== undefined) {
        const existingDateKey = dateKey(new Date(occurrence.scheduled_at));
        occurrence.scheduled_at = new Date(
          `${existingDateKey}T${series.time_of_day}+08:00`
        ).toISOString();
      }

      const hasResponses =
        s.votes.some((v) => v.event_id === occurrence.id) ||
        s.rsvps.some((r) => r.event_id === occurrence.id);
      // Once someone's actually answered, changing the place/mode/invitees
      // out from under them would invalidate what they answered — leave
      // this occurrence's own options/invitees exactly as they are.
      if (hasResponses) continue;

      const inviteeSet = new Set(series.invitee_ids);
      if (series.kaki_id) {
        for (const m of s.kakiMembers.filter(
          (km) => km.kaki_id === series.kaki_id
        )) {
          inviteeSet.add(m.user_id);
        }
      }
      inviteeSet.delete(series.host_id);
      s.invitees = s.invitees.filter((i) => i.event_id !== occurrence.id);
      for (const userId of inviteeSet) {
        s.invitees.push({ event_id: occurrence.id, user_id: userId });
      }
      occurrence.kaki_id = series.kaki_id ?? null;

      s.options = s.options.filter((o) => o.event_id !== occurrence.id);
      const placeIds =
        series.mode === "fixed"
          ? [series.fixed_place_id!]
          : series.option_place_ids;
      for (const placeId of placeIds) {
        s.options.push({
          event_id: occurrence.id,
          place_id: placeId,
          added_by: hostId,
          is_suggested: false,
        });
      }
    }

    return series;
  },

  async generateDueOccurrences(hostId) {
    const s = store();
    const due = s.recurringSeries.filter(
      (series) => series.host_id === hostId && series.status === "active"
    );
    if (due.length === 0) return 0;

    let generated = 0;
    const today = sgtToday();

    for (const series of due) {
      const next = nextOccurrence(series.weekday, today);
      const nextKey = dateKey(next);
      const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);

      if (daysAway > RECURRING_LOOKAHEAD_DAYS) continue;
      if (series.last_generated_date && series.last_generated_date >= nextKey) {
        continue;
      }

      // Expanded fresh each time, not snapshotted on the series — see the
      // header comment on 031_recurring_series.sql for why.
      const inviteeSet = new Set(series.invitee_ids);
      if (series.kaki_id) {
        for (const m of s.kakiMembers.filter((km) => km.kaki_id === series.kaki_id)) {
          inviteeSet.add(m.user_id);
        }
      }
      inviteeSet.delete(series.host_id);

      // `time_of_day` is a wall-clock time meant as Singapore local time —
      // an explicit +08:00 offset parses to the correct instant regardless
      // of what timezone this server process happens to be running in.
      // `setHours` on a plain Date used the *runtime's* local timezone
      // instead, silently writing e.g. "12:00" as 12:00 UTC (8pm SGT) —
      // CHANGES_20260819b.md §2.
      const scheduledAt = new Date(`${nextKey}T${series.time_of_day}+08:00`);

      const placeIds =
        series.mode === "fixed"
          ? [series.fixed_place_id!]
          : series.option_place_ids;

      const created = await demoRepo.createEvent(
        series.host_id,
        series.title,
        scheduledAt.toISOString(),
        series.office_id ?? DEFAULT_OFFICE.id,
        placeIds,
        series.kaki_id ?? null,
        [...inviteeSet]
      );
      created.recurring_series_id = series.id;

      series.last_generated_date = nextKey;
      generated += 1;
    }

    return generated;
  },

  // ---- Wishlist ----

  async listWishlist(userId) {
    const s = store();
    return s.wishlist
      .filter((w) => w.user_id === userId)
      .map((w) => {
        const place = s.places.find((p) => p.id === w.place_id);
        return { ...w, place: place ? enrich(place) : undefined };
      });
  },

  async toggleWishlist(userId, placeId) {
    const s = store();
    const index = s.wishlist.findIndex(
      (w) => w.user_id === userId && w.place_id === placeId
    );
    if (index === -1) {
      s.wishlist.push({
        user_id: userId,
        place_id: placeId,
        created_at: new Date().toISOString(),
      });
      return { added: true };
    }
    s.wishlist.splice(index, 1);
    return { added: false };
  },

  // ---- Kakis ----

  async createKaki(userId, name, initialMemberIds = []) {
    const s = store();
    const kaki: Kaki = {
      id: `demo-kaki-${uuid().slice(0, 8)}`,
      name,
      created_by: userId,
      invite_token: generateToken(),
      created_at: new Date().toISOString(),
    };
    s.kakis.push(kaki);
    const memberIds = Array.from(new Set([userId, ...initialMemberIds]));
    for (const memberId of memberIds) {
      s.kakiMembers.push({
        kaki_id: kaki.id,
        user_id: memberId,
        joined_at: new Date().toISOString(),
      });
    }
    return { ...kaki, member_count: memberIds.length };
  },

  async getKaki(idOrToken) {
    const s = store();
    const kaki = s.kakis.find(
      (k) => k.id === idOrToken || k.invite_token === idOrToken
    );
    if (!kaki) return null;

    const members: KakiMember[] = s.kakiMembers
      .filter((m) => m.kaki_id === kaki.id)
      .map((m) => ({ ...m, display_name: displayNameFor(m.user_id) }));

    const detail: KakiDetail = {
      ...kaki,
      member_count: members.length,
      members,
    };
    return detail;
  },

  async listKakis(userId) {
    const s = store();
    const myKakiIds = new Set(
      s.kakiMembers.filter((m) => m.user_id === userId).map((m) => m.kaki_id)
    );
    return s.kakis
      .filter((k) => myKakiIds.has(k.id))
      .map((k) => ({
        ...k,
        member_count: s.kakiMembers.filter((m) => m.kaki_id === k.id).length,
      }));
  },

  async joinKaki(token, userId) {
    const s = store();
    const kaki = s.kakis.find(
      (k) => k.invite_token === token || k.id === token
    );
    if (!kaki) throw new Error("That invite link is not valid");

    const already = s.kakiMembers.some(
      (m) => m.kaki_id === kaki.id && m.user_id === userId
    );
    if (!already) {
      s.kakiMembers.push({
        kaki_id: kaki.id,
        user_id: userId,
        joined_at: new Date().toISOString(),
      });
    }

    return {
      ...kaki,
      member_count: s.kakiMembers.filter((m) => m.kaki_id === kaki.id).length,
    };
  },

  async leaveKaki(kakiId, userId) {
    const s = store();
    s.kakiMembers = s.kakiMembers.filter(
      (m) => !(m.kaki_id === kakiId && m.user_id === userId)
    );
  },

  async addKakiMember(kakiId, userId, addedBy) {
    const s = store();
    if (!s.kakis.some((k) => k.id === kakiId)) {
      throw new Error("That group does not exist");
    }

    const callerIsMember = s.kakiMembers.some(
      (m) => m.kaki_id === kakiId && m.user_id === addedBy
    );
    if (!callerIsMember) {
      throw new Error("Only a member of this group can add someone to it");
    }

    const already = s.kakiMembers.some(
      (m) => m.kaki_id === kakiId && m.user_id === userId
    );
    if (!already) {
      s.kakiMembers.push({
        kaki_id: kakiId,
        user_id: userId,
        joined_at: new Date().toISOString(),
      });
    }
  },

  // ---- Lobangs ----

  async sendLobang(fromUserId, target, placeId, note, eventId) {
    const s = store();
    let recipientIds: string[] = [];
    let kakiId: string | null = null;
    let publicToken: string | null = null;

    if (target.type === "public") {
      publicToken = generateToken();
    } else if (target.type === "kaki") {
      const kaki = s.kakis.find((k) => k.id === target.kakiId);
      if (!kaki) throw new Error("That Kaki does not exist");
      const isMember = s.kakiMembers.some(
        (m) => m.kaki_id === target.kakiId && m.user_id === fromUserId
      );
      if (!isMember) {
        throw new Error(
          "You're not allowed to send a lobang to a Kaki you're not in"
        );
      }
      recipientIds = s.kakiMembers
        .filter((m) => m.kaki_id === target.kakiId)
        .map((m) => m.user_id);
      kakiId = target.kakiId;
    } else {
      recipientIds = target.userIds;
    }

    // The sender never counts as their own recipient, even if the target
    // Kaki includes them.
    recipientIds = Array.from(new Set(recipientIds)).filter(
      (id) => id !== fromUserId
    );
    // A public send has no recipient list to be empty in the first place.
    if (target.type !== "public" && recipientIds.length === 0) {
      throw new Error("At least one recipient is required");
    }

    const lobang: Lobang = {
      id: `demo-lobang-${uuid().slice(0, 8)}`,
      from_user_id: fromUserId,
      place_id: placeId,
      note: note ?? null,
      event_id: eventId ?? null,
      kaki_id: kakiId,
      public_token: publicToken,
      created_at: new Date().toISOString(),
    };
    s.lobangs.push(lobang);
    for (const userId of recipientIds) {
      s.lobangRecipients.push({ lobang_id: lobang.id, user_id: userId, seen_at: null });
    }

    return { ...hydrateSentLobang(lobang), recipient_ids: recipientIds };
  },

  async listLobangsReceived(userId, limit = 20) {
    const s = store();
    const lobangIds = new Set(
      s.lobangRecipients
        .filter((r) => r.user_id === userId)
        .map((r) => r.lobang_id)
    );
    return s.lobangs
      .filter((l) => lobangIds.has(l.id))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, limit)
      .map((l) => hydrateReceivedLobang(l, userId));
  },

  async listLobangsSent(userId, limit = 20) {
    return store()
      .lobangs.filter((l) => l.from_user_id === userId && !l.public_token)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, limit)
      .map(hydrateSentLobang);
  },

  async markLobangSeen(userId, lobangId) {
    const recipient = store().lobangRecipients.find(
      (r) => r.lobang_id === lobangId && r.user_id === userId
    );
    if (recipient && !recipient.seen_at) {
      recipient.seen_at = new Date().toISOString();
    }
  },

  async dismissLobang(userId, lobangId) {
    const s = store();
    const lobang = s.lobangs.find((l) => l.id === lobangId);

    if (lobang && lobang.from_user_id === userId) {
      // The sender retracts the whole send — every recipient's copy goes.
      s.lobangs = s.lobangs.filter((l) => l.id !== lobangId);
      s.lobangRecipients = s.lobangRecipients.filter(
        (r) => r.lobang_id !== lobangId
      );
      return;
    }

    // A recipient dismissing "their copy" only removes their own row, so a
    // group send's other recipients are unaffected. A no-op for a stranger.
    s.lobangRecipients = s.lobangRecipients.filter(
      (r) => !(r.lobang_id === lobangId && r.user_id === userId)
    );
  },

  async getPublicLobang(token) {
    const s = store();
    const lobang = s.lobangs.find((l) => l.public_token === token);
    if (!lobang) return null;

    const place = s.places.find(
      (p) => p.id === lobang.place_id && p.status === "active"
    );
    if (!place) return null;

    const enriched = enrich(place);
    return {
      place: {
        id: enriched.id,
        name: enriched.name,
        address: enriched.address ?? null,
        cuisine: enriched.cuisine,
        custom_cuisine_tags: enriched.custom_cuisine_tags,
        budget_tier: enriched.budget_tier,
        best_dishes: enriched.best_dishes,
        avg_rating: enriched.avg_rating ?? null,
        visit_count: enriched.visit_count ?? 0,
        lat: enriched.lat,
        lng: enriched.lng,
        google_place_id: enriched.google_place_id ?? null,
      },
      from_display_name: displayNameFor(lobang.from_user_id),
      note: lobang.note ?? null,
      created_at: lobang.created_at ?? new Date().toISOString(),
    };
  },

  async suggestPlacesForFriend(toUserId, limit = 5) {
    const s = store();
    const places = s.places
      .filter((p) => p.status === "active")
      .map((p) => enrich(p));

    // Only the friend's *public* visits — the same slice anyone on the team
    // could already see on their profile. Private ratings and prefs never
    // factor in, so this is honest about how "personalized" it really is.
    const friendVisits = s.visits.filter(
      (v) => v.user_id === toUserId && v.is_public
    );

    return rankPlaces(places, friendVisits, null, [], { limit });
  },

  // ---- Admin & moderation ----

  async isAdmin(userId) {
    // Demo mode has no RLS to lean on, so it gets an equivalent in-memory
    // check: DEMO_USER_ID is admin by default, same spirit as demo mode
    // already showing off every feature. No other demo teammate is.
    return userId === DEMO_USER_ID;
  },

  async listAdminIds() {
    return [DEMO_USER_ID];
  },

  async listAdminReportRecipients() {
    const s = store();
    const profile = s.profiles.find((p) => p.user_id === DEMO_USER_ID);
    // Undefined means the demo profile predates this preference — default
    // on, matching the column's own DB default (same convention as
    // getPushTargets's notify_events check just above).
    return profile?.notify_admin_reports === false ? [] : [DEMO_USER_ID];
  },

  async blockPlace(userId, placeId, reason) {
    if (!reason || reason.trim().length === 0) {
      throw new Error("A reason is required to block a place");
    }

    const s = store();
    const place = s.places.find((p) => p.id === placeId);
    if (!place) throw new Error("That place does not exist");

    const admin = userId === DEMO_USER_ID;
    if (place.created_by !== userId && !admin) {
      throw new Error("Only the place's creator or an admin can block it");
    }

    const index = s.places.findIndex((p) => p.id === placeId);
    s.places[index] = {
      ...s.places[index],
      status: "blocked",
      updated_at: new Date().toISOString(),
    };

    s.moderationLog.push({
      id: uuid(),
      place_id: placeId,
      actor_id: userId,
      action: "block",
      reason: reason.trim(),
      created_at: new Date().toISOString(),
    });

    return enrich(s.places[index]);
  },

  async unblockPlace(userId, placeId) {
    const admin = userId === DEMO_USER_ID;
    if (!admin) throw new Error("Only an admin can unblock a place");

    const s = store();
    const index = s.places.findIndex((p) => p.id === placeId);
    if (index === -1) throw new Error("That place does not exist");
    if (s.places[index].status !== "blocked") {
      throw new Error("That place is not currently blocked");
    }

    s.places[index] = {
      ...s.places[index],
      status: "active",
      updated_at: new Date().toISOString(),
    };

    s.moderationLog.push({
      id: uuid(),
      place_id: placeId,
      actor_id: userId,
      action: "unblock",
      reason: null,
      created_at: new Date().toISOString(),
    });

    return enrich(s.places[index]);
  },

  async listModerationLog(limit = 100) {
    const s = store();
    return [...s.moderationLog]
      .sort((a, b) => (a.created_at! < b.created_at! ? 1 : -1))
      .slice(0, limit)
      .map((entry) => ({
        ...entry,
        place_name: s.places.find((p) => p.id === entry.place_id)?.name,
        actor_display_name: displayNameFor(entry.actor_id),
      }));
  },

  async getAdminAnalytics(days = 90, segment = null) {
    const s = store();
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const inWindow = (iso?: string | null) => Boolean(iso) && iso! >= cutoff.toISOString();
    const segmentMembers = segment ? resolveSegmentMemberIds(s, days, segment) : null;

    // ---- funnel (today, Asia/Singapore) ----
    const today = (iso?: string | null) => Boolean(iso) && isSameSgtDay(iso!, now);
    const votedToday = new Set(
      s.votes.filter((v) => today(v.created_at)).map((v) => v.user_id)
    );
    const hostedToday = new Set(
      s.events.filter((e) => today(e.created_at)).map((e) => e.host_id)
    );
    const visitedToday = new Set(
      s.visits.filter((v) => today(v.created_at)).map((v) => v.user_id)
    );
    const wishlistedToday = new Set(
      s.wishlist.filter((w) => today(w.created_at)).map((w) => w.user_id)
    );
    const placesCreatedToday = new Set(
      s.places.filter((p) => today(p.created_at) && p.created_by).map((p) => p.created_by!)
    );
    const flaggedToday = new Set(
      s.placeFlags.filter((f) => today(f.created_at)).map((f) => f.flagged_by)
    );
    const participatingToday = new Set([
      ...votedToday,
      ...hostedToday,
      ...visitedToday,
      ...wishlistedToday,
      ...placesCreatedToday,
      ...flaggedToday,
    ]);

    // ---- performance: same six "did anything" signals as the funnel
    // above, over the whole window instead of collapsed to today.
    const activityInWindow: UserActivity[] = [
      ...s.votes
        .filter((v) => inWindow(v.created_at))
        .map((v) => ({ userId: v.user_id, createdAt: v.created_at! })),
      ...s.events
        .filter((e) => inWindow(e.created_at))
        .map((e) => ({ userId: e.host_id, createdAt: e.created_at! })),
      ...s.visits
        .filter((v) => inWindow(v.created_at))
        .map((v) => ({ userId: v.user_id, createdAt: v.created_at! })),
      ...s.wishlist
        .filter((w) => inWindow(w.created_at))
        .map((w) => ({ userId: w.user_id, createdAt: w.created_at! })),
      ...s.places
        .filter((p) => p.created_by && inWindow(p.created_at))
        .map((p) => ({ userId: p.created_by!, createdAt: p.created_at! })),
      ...s.placeFlags
        .filter((f) => inWindow(f.created_at))
        .map((f) => ({ userId: f.flagged_by, createdAt: f.created_at! })),
    ];
    const dauPerDay = bucketDistinctUsersByDay(activityInWindow);
    const wauPerWeek = bucketDistinctUsersByWeek(activityInWindow);
    const mauPerMonth = bucketDistinctUsersByMonth(activityInWindow);

    // ---- funnel steps (Part 1 §D): real invited -> responded -> voted ->
    // attended -> reviewed conversion, scoped to decided Jios (closed with
    // a winner) in the window — a Jio that never resolved has nothing to
    // attend or review.
    const decidedEventsInWindow = s.events.filter(
      (e) =>
        inWindow(e.created_at) &&
        e.status === "closed" &&
        e.winner_place_id &&
        (!segmentMembers || segmentMembers.has(e.host_id))
    );
    type FunnelRow = {
      eventCreatedAt: string;
      responded: boolean;
      voted: boolean;
      attended: boolean;
      reviewed: boolean;
      signupAt?: string;
    };
    const funnelRows: FunnelRow[] = [];
    for (const e of decidedEventsInWindow) {
      for (const uid of resolveEventParticipants(e)) {
        const rsvp = s.rsvps.find((r) => r.event_id === e.id && r.user_id === uid);
        const responded = Boolean(rsvp);
        const attended = rsvp?.response === "yes";
        const voted = s.votes.some((v) => v.event_id === e.id && v.user_id === uid);
        const reviewed = Boolean(
          attended &&
            e.closed_at &&
            s.visits.some(
              (v) =>
                v.user_id === uid &&
                v.place_id === e.winner_place_id &&
                v.created_at &&
                v.created_at >= e.closed_at!
            )
        );
        const signupAt = s.profiles.find((p) => p.user_id === uid)?.created_at;
        funnelRows.push({
          eventCreatedAt: e.created_at!,
          responded,
          voted,
          attended,
          reviewed,
          signupAt,
        });
      }
    }
    const funnelSteps = {
      steps: [
        { step: "invited" as const, count: funnelRows.length },
        { step: "responded" as const, count: funnelRows.filter((r) => r.responded).length },
        { step: "voted" as const, count: funnelRows.filter((r) => r.voted).length },
        { step: "attended" as const, count: funnelRows.filter((r) => r.attended).length },
        { step: "reviewed" as const, count: funnelRows.filter((r) => r.reviewed).length },
      ],
      trend: {
        invitedPerWeek: bucketByWeek(funnelRows.map((r) => r.eventCreatedAt)),
        respondedPerWeek: bucketByWeek(
          funnelRows.filter((r) => r.responded).map((r) => r.eventCreatedAt)
        ),
        votedPerWeek: bucketByWeek(
          funnelRows.filter((r) => r.voted).map((r) => r.eventCreatedAt)
        ),
        attendedPerWeek: bucketByWeek(
          funnelRows.filter((r) => r.attended).map((r) => r.eventCreatedAt)
        ),
        reviewedPerWeek: bucketByWeek(
          funnelRows.filter((r) => r.reviewed).map((r) => r.eventCreatedAt)
        ),
      },
      cohortBySignupWeek: (() => {
        const byWeek = new Map<
          string,
          { invited: number; responded: number; voted: number; attended: number; reviewed: number }
        >();
        for (const r of funnelRows) {
          if (!r.signupAt) continue;
          const week = sgtWeekKey(r.signupAt);
          const c = byWeek.get(week) ?? {
            invited: 0,
            responded: 0,
            voted: 0,
            attended: 0,
            reviewed: 0,
          };
          c.invited += 1;
          if (r.responded) c.responded += 1;
          if (r.voted) c.voted += 1;
          if (r.attended) c.attended += 1;
          if (r.reviewed) c.reviewed += 1;
          byWeek.set(week, c);
        }
        return Array.from(byWeek.entries())
          .map(([weekStart, c]) => ({ weekStart, ...c }))
          .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      })(),
    };

    // ---- growth ----
    const newUsersPerDay = bucketByDay(
      s.profiles.filter((p) => inWindow(p.created_at)).map((p) => p.created_at!)
    );
    // Who actually joined each day (Part 1 §E) — powers the "new users"
    // sparkline's click-through, not just its count.
    const newUsersDetail = (() => {
      const byDay = new Map<string, { id: string; name: string }[]>();
      for (const p of s.profiles) {
        if (!inWindow(p.created_at)) continue;
        const day = sgtDateKey(p.created_at!);
        const list = byDay.get(day) ?? [];
        list.push({ id: p.user_id, name: p.display_name });
        byDay.set(day, list);
      }
      return Array.from(byDay.entries())
        .map(([date, users]) => ({
          date,
          users: users.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    })();
    const jiosCreatedPerDay = bucketByDay(
      s.events.filter((e) => inWindow(e.created_at)).map((e) => e.created_at!)
    );
    // Daily Activity Log — always the trailing 7 days, independent of
    // `days`/`segment` (same "today, not the window" reasoning as the
    // funnel above), newest day first.
    const recentEntrants = (() => {
      const cutoffKey = sgtDateKey(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
      const byDay = new Map<
        string,
        { id: string; name: string; pageViews: number }[]
      >();
      for (const v of s.dailyVisits) {
        if (v.visit_date < cutoffKey) continue;
        const list = byDay.get(v.visit_date) ?? [];
        list.push({
          id: v.user_id,
          name: displayNameFor(v.user_id),
          pageViews: v.page_view_count,
        });
        byDay.set(v.visit_date, list);
      }
      return Array.from(byDay.entries())
        .map(([date, users]) => ({
          date,
          users: users.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
    })();
    const placesAddedPerDay = bucketByDay(
      s.places.filter((p) => inWindow(p.created_at)).map((p) => p.created_at!)
    );
    const kakiGroupsCreatedPerDay = bucketByDay(
      s.kakis.filter((k) => inWindow(k.created_at)).map((k) => k.created_at!)
    );

    // ---- Jio outcomes ----
    const eventsInWindow = s.events.filter(
      (e) => inWindow(e.created_at) && (!segmentMembers || segmentMembers.has(e.host_id))
    );
    const decided = eventsInWindow.filter(
      (e) => e.status === "closed" && e.winner_place_id
    ).length;
    const closedNoWinner = eventsInWindow.filter(
      (e) => e.status === "closed" && !e.winner_place_id
    ).length;
    const cancelled = eventsInWindow.filter((e) => e.status === "cancelled").length;
    const stillOpen = eventsInWindow.filter((e) => e.status === "open").length;

    const ballotsPerEvent = eventsInWindow.map(
      (e) => new Set(s.votes.filter((v) => v.event_id === e.id).map((v) => v.user_id)).size
    );
    const avgBallotsPerJio =
      ballotsPerEvent.length > 0
        ? ballotsPerEvent.reduce((a, b) => a + b, 0) / ballotsPerEvent.length
        : 0;

    const decisionHours = eventsInWindow
      .filter((e) => e.created_at && e.closed_at)
      .map(
        (e) =>
          (new Date(e.closed_at!).getTime() - new Date(e.created_at!).getTime()) /
          3_600_000
      );
    const medianTimeToDecisionHours = median(decisionHours);

    // ---- content / places ----
    // Raw store places carry none of avg_rating/visit_count/walk_minutes —
    // those are computed on demand by enrich() at read time, not stored.
    // Mirrors that same computation here rather than reading fields that
    // don't exist on the unenriched rows.
    const placeStats = new Map(
      s.places.map((place) => {
        const visits = s.visits.filter((v) => v.place_id === place.id);
        const rated = visits.filter((v) => typeof v.rating === "number");
        const avgRating =
          rated.length > 0
            ? rated.reduce((sum, v) => sum + v.rating, 0) / rated.length
            : null;
        const cached = s.walkCache.find((w) => w.place_id === place.id);
        const walkMinutes =
          cached?.walk_minutes ??
          estimateWalkMinutes(
            haversine(
              DEFAULT_OFFICE.lat,
              DEFAULT_OFFICE.lng,
              place.lat,
              place.lng
            )
          );
        return [
          place.id,
          { visitCount: visits.length, avgRating, walkMinutes },
        ] as const;
      })
    );

    const RATING_FLOOR_VISITS = 3;
    const topRatedPlaces = s.places
      .map((p) => ({ place: p, stats: placeStats.get(p.id)! }))
      .filter(
        (x) => x.stats.visitCount >= RATING_FLOOR_VISITS && x.stats.avgRating !== null
      )
      .sort((a, b) => (b.stats.avgRating ?? 0) - (a.stats.avgRating ?? 0))
      .slice(0, 10)
      .map((x) => ({
        id: x.place.id,
        name: x.place.name,
        count: x.stats.visitCount,
        avgRating: x.stats.avgRating ?? 0,
      }));

    const mostVisitedPlaces = s.places
      .map((p) => ({ place: p, stats: placeStats.get(p.id)! }))
      .sort((a, b) => b.stats.visitCount - a.stats.visitCount)
      .slice(0, 10)
      .map((x) => ({ id: x.place.id, name: x.place.name, count: x.stats.visitCount }));

    const cuisineDistribution: Record<string, number> = {};
    let customCuisineTagUsageCount = 0;
    for (const place of s.places) {
      for (const cuisine of place.cuisine) {
        cuisineDistribution[cuisine] = (cuisineDistribution[cuisine] ?? 0) + 1;
      }
      customCuisineTagUsageCount += place.custom_cuisine_tags.length;
    }

    const walkTimeBuckets = bucketWalkMinutes(
      s.places.map((p) => placeStats.get(p.id)!.walkMinutes)
    );

    // ---- social / Kaki ----
    const mostActiveKakis = [...s.kakis]
      .map((k) => ({
        id: k.id,
        name: k.name,
        count: s.events.filter((e) => e.kaki_id === k.id).length,
      }))
      .filter((k) => k.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const sizeByKaki = new Map<string, number>();
    for (const member of s.kakiMembers) {
      sizeByKaki.set(member.kaki_id, (sizeByKaki.get(member.kaki_id) ?? 0) + 1);
    }
    const groupSizeCounts = new Map<number, number>();
    for (const size of sizeByKaki.values()) {
      groupSizeCounts.set(size, (groupSizeCounts.get(size) ?? 0) + 1);
    }
    const groupSizeDistribution = Array.from(groupSizeCounts.entries())
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => a.size - b.size);

    // ---- moderation ----
    const flagsInWindow = s.placeFlags.filter((f) => inWindow(f.created_at));
    const reportsFiledPerWeek = bucketByWeek(
      flagsInWindow.map((f) => f.created_at!)
    );
    const resolvedInWindow = flagsInWindow.filter((f) => f.resolved_at);
    const reportsResolvedPerWeek = bucketByWeek(
      resolvedInWindow.map((f) => f.resolved_at!)
    );
    const resolutionHours = resolvedInWindow.map(
      (f) =>
        (new Date(f.resolved_at!).getTime() - new Date(f.created_at!).getTime()) /
        3_600_000
    );
    const avgResolutionHours =
      resolutionHours.length > 0
        ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length
        : null;
    const pendingCount = s.placeFlags.filter((f) => f.status === "pending").length;

    // ---- wishlist ----
    const wishlistInWindow = s.wishlist.filter((w) => inWindow(w.created_at));
    const savesPerWeek = bucketByWeek(
      wishlistInWindow.map((w) => w.created_at!)
    );
    const savesByPlace = new Map<string, number>();
    for (const entry of s.wishlist) {
      savesByPlace.set(entry.place_id, (savesByPlace.get(entry.place_id) ?? 0) + 1);
    }
    const mostSavedPlaces = Array.from(savesByPlace.entries())
      .map(([placeId, count]) => ({
        id: placeId,
        name: s.places.find((p) => p.id === placeId)?.name ?? "Unknown place",
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      windowDays: days,
      generatedAt: now.toISOString(),
      appliedSegment: segment ?? null,
      funnel: {
        participatingDau: participatingToday.size,
        respondedToInviteTotal: s.rsvps.length,
        votedInJioToday: votedToday.size,
        hostedJioToday: hostedToday.size,
      },
      growth: {
        newUsersPerDay,
        newUsersDetail,
        jiosCreatedPerDay,
        placesAddedPerDay,
        kakiGroupsCreatedPerDay,
        kakiGroupsCumulative: s.kakis.length,
      },
      recentEntrants,
      jioOutcomes: {
        decided,
        closedNoWinner,
        cancelled,
        stillOpen,
        avgBallotsPerJio,
        medianTimeToDecisionHours,
      },
      content: {
        topRatedPlaces,
        mostVisitedPlaces,
        cuisineDistribution,
        customCuisineTagUsageCount,
        walkTimeBuckets,
      },
      social: {
        mostActiveKakis,
        groupSizeDistribution,
      },
      moderation: {
        reportsFiledPerWeek,
        reportsResolvedPerWeek,
        avgResolutionHours,
        pendingCount,
      },
      wishlist: {
        savesPerWeek,
        mostSavedPlaces,
      },
      performance: {
        dauPerDay,
        wauPerWeek,
        mauPerMonth,
      },
      funnelSteps,
    };
  },

  async getAdminPlaceDetail(placeId) {
    const s = store();
    const place = s.places.find((p) => p.id === placeId);
    if (!place) return null;

    const placeVisits = s.visits.filter((v) => v.place_id === placeId);

    const visitCountByUser = new Map<string, number>();
    for (const v of placeVisits) {
      visitCountByUser.set(v.user_id, (visitCountByUser.get(v.user_id) ?? 0) + 1);
    }
    const visitors = Array.from(visitCountByUser.entries())
      .map(([userId, count]) => ({
        id: userId,
        name: s.profiles.find((p) => p.user_id === userId)?.display_name ?? "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const ratedVisits = placeVisits.filter(
      (v) => typeof v.rating === "number" && v.created_at
    );
    const ratingByWeek = new Map<string, { sum: number; count: number }>();
    for (const v of ratedVisits) {
      const week = sgtWeekKey(v.created_at!);
      const entry = ratingByWeek.get(week) ?? { sum: 0, count: 0 };
      entry.sum += v.rating;
      entry.count += 1;
      ratingByWeek.set(week, entry);
    }
    const ratingTrend = Array.from(ratingByWeek.entries())
      .map(([date, { sum, count }]) => ({
        date,
        avgRating: Math.round((sum / count) * 100) / 100,
        count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const wishlistSaveCount = s.wishlist.filter((w) => w.place_id === placeId).length;
    const lobangMentionCount = s.lobangs.filter((l) => l.place_id === placeId).length;

    const distinctVisitorIds = Array.from(visitCountByUser.keys());
    const visitorPrefs = distinctVisitorIds
      .map((uid) => s.prefs.find((p) => p.user_id === uid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const withCuisineLikes = visitorPrefs.filter((p) => p.cuisine_likes.length > 0);
    const cuisineAlignmentPct =
      withCuisineLikes.length > 0
        ? Math.round(
            (100 *
              withCuisineLikes.filter((p) =>
                p.cuisine_likes.some((c) => place.cuisine.includes(c))
              ).length) /
              withCuisineLikes.length
          )
        : null;

    const budgetAlignmentPct =
      visitorPrefs.length > 0
        ? Math.round(
            (100 *
              visitorPrefs.filter(
                (p) =>
                  place.budget_tier >= p.budget_min && place.budget_tier <= p.budget_max
              ).length) /
              visitorPrefs.length
          )
        : null;

    return {
      placeId,
      visitors,
      ratingTrend,
      wishlistSaveCount,
      lobangMentionCount,
      cuisineAlignmentPct,
      budgetAlignmentPct,
    };
  },

  async getAdminUsersData(days = 90) {
    const s = store();
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const inWindow = (iso?: string | null) => Boolean(iso) && iso! >= cutoff;

    const weights = s.engagementWeights;

    const rows = s.profiles.map((p) => {
      const uid = p.user_id;

      const hostedCount = s.events.filter(
        (e) => e.host_id === uid && inWindow(e.created_at)
      ).length;
      const votedEventIds = new Set(
        s.votes
          .filter((v) => v.user_id === uid && inWindow(v.created_at))
          .map((v) => v.event_id)
      );
      const votedCount = votedEventIds.size;
      // Lifetime, not windowed — event_rsvps has no timestamp column, the
      // same schema gap as funnel.respondedToInviteTotal.
      const rsvpCount = s.rsvps.filter((r) => r.user_id === uid).length;
      const visitCount = s.visits.filter(
        (v) => v.user_id === uid && inWindow(v.created_at)
      ).length;
      const reviewCount = s.visits.filter(
        (v) => v.user_id === uid && v.is_public && inWindow(v.created_at)
      ).length;
      const lobangCount = s.lobangs.filter(
        (l) => l.from_user_id === uid && inWindow(l.created_at)
      ).length;

      const activityTimestamps = [
        ...s.events.filter((e) => e.host_id === uid).map((e) => e.created_at),
        ...s.votes.filter((v) => v.user_id === uid).map((v) => v.created_at),
        ...s.visits.filter((v) => v.user_id === uid).map((v) => v.created_at),
        ...s.wishlist.filter((w) => w.user_id === uid).map((w) => w.created_at),
        ...s.lobangs.filter((l) => l.from_user_id === uid).map((l) => l.created_at),
        ...s.placeFlags.filter((f) => f.flagged_by === uid).map((f) => f.created_at),
      ].filter((ts): ts is string => Boolean(ts));
      const lastActiveAt =
        activityTimestamps.length > 0
          ? activityTimestamps.reduce((max, ts) => (ts > max ? ts : max))
          : null;

      const score =
        hostedCount * weights.hosted +
        votedCount * weights.voted +
        rsvpCount * weights.rsvp +
        visitCount * weights.visit +
        reviewCount * weights.review +
        lobangCount * weights.lobang;

      return {
        uid,
        name: p.display_name,
        signupAt: p.created_at,
        hostedCount,
        votedCount,
        rsvpCount,
        visitCount,
        reviewCount,
        lobangCount,
        lastActiveAt,
        score,
      };
    });

    const toSummary = (r: (typeof rows)[number]) => ({
      id: r.uid,
      name: r.name,
      score: Math.round(r.score * 10) / 10,
      hostedCount: r.hostedCount,
      votedCount: r.votedCount,
      rsvpCount: r.rsvpCount,
      visitCount: r.visitCount,
      reviewCount: r.reviewCount,
      lobangCount: r.lobangCount,
    });

    const leaderboard = rows
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(toSummary);

    return {
      windowDays: days,
      weights: { ...weights },
      leaderboard,
      segments: {
        powerHosts: rows
          .filter((r) => r.hostedCount >= 3 && r.votedCount <= 1)
          .sort((a, b) => b.hostedCount - a.hostedCount)
          .map(toSummary),
        activeVoters: rows
          .filter((r) => r.votedCount >= 3 && r.hostedCount <= 1)
          .sort((a, b) => b.votedCount - a.votedCount)
          .map(toSummary),
        rsvpOnlyLurkers: rows
          .filter((r) => r.rsvpCount >= 3 && r.votedCount === 0 && r.hostedCount === 0)
          .sort((a, b) => b.rsvpCount - a.rsvpCount)
          .map(toSummary),
        reviewers: rows
          .filter((r) => r.reviewCount >= 2)
          .sort((a, b) => b.reviewCount - a.reviewCount)
          .map(toSummary),
        dormant: rows
          .filter((r) => !r.lastActiveAt || r.lastActiveAt < thirtyDaysAgo)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(toSummary),
        newAndActive: rows
          .filter(
            (r) =>
              r.signupAt &&
              r.signupAt >= thirtyDaysAgo &&
              r.hostedCount + r.votedCount + r.visitCount + r.lobangCount > 0
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(toSummary),
      },
    };
  },

  async updateEngagementWeights(weights) {
    const s = store();
    s.engagementWeights = { ...weights, updatedAt: new Date().toISOString() };
    return { ...s.engagementWeights };
  },

  async getAdminUserDetail(userId) {
    const s = store();
    const profile = s.profiles.find((p) => p.user_id === userId);
    if (!profile) return null;

    const visits = s.visits.filter((v) => v.user_id === userId);
    const hostedCount = s.events.filter((e) => e.host_id === userId).length;

    const kakiIds = new Set(
      s.kakiMembers.filter((m) => m.user_id === userId).map((m) => m.kaki_id)
    );
    const kakiMemberships = s.kakis
      .filter((k) => kakiIds.has(k.id))
      .map((k) => ({ id: k.id, name: k.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const lobangsSent = s.lobangs.filter((l) => l.from_user_id === userId).length;
    // Recipients live in lobangRecipients (snapshotted at send time), not a
    // `to_user_id` column on the raw stored row — that field only ever gets
    // populated at hydration time (see the `Lobang` type's own doc comment),
    // so filtering the raw store on it here always silently returned 0.
    const lobangsReceived = s.lobangRecipients.filter(
      (r) => r.user_id === userId
    ).length;

    const activityTimestamps = [
      ...s.events.filter((e) => e.host_id === userId).map((e) => e.created_at),
      ...s.votes.filter((v) => v.user_id === userId).map((v) => v.created_at),
      ...s.visits.filter((v) => v.user_id === userId).map((v) => v.created_at),
      ...s.wishlist.filter((w) => w.user_id === userId).map((w) => w.created_at),
      ...s.lobangs.filter((l) => l.from_user_id === userId).map((l) => l.created_at),
      ...s.placeFlags.filter((f) => f.flagged_by === userId).map((f) => f.created_at),
    ].filter((ts): ts is string => Boolean(ts));
    const lastActiveAt =
      activityTimestamps.length > 0
        ? activityTimestamps.reduce((max, ts) => (ts > max ? ts : max))
        : null;

    // Lifetime — every event this person was ever a participant in (host,
    // Kaki member, or explicit invitee), the same resolution
    // resolveEventParticipants() does for one event, run here across every
    // event this person could ever have been part of.
    const invitedEventIds = new Set<string>();
    for (const e of s.events) {
      if (e.host_id === userId) invitedEventIds.add(e.id);
      else if (e.kaki_id && kakiIds.has(e.kaki_id)) invitedEventIds.add(e.id);
    }
    for (const invitee of s.invitees) {
      if (invitee.user_id === userId) invitedEventIds.add(invitee.event_id);
    }
    const rsvpResponsivenessPct =
      invitedEventIds.size > 0
        ? Math.round(
            (100 *
              Array.from(invitedEventIds).filter((eventId) =>
                s.rsvps.some((r) => r.event_id === eventId && r.user_id === userId)
              ).length) /
              invitedEventIds.size
          )
        : null;

    const metrics = computeUserMetrics(visits, s.places);

    // Daily Activity Log — last 30 days, one entry per day this person
    // visited the app at all. A visit day with zero logged actions still
    // appears (empty `actions`); a day with no visit is simply absent.
    const dailyActivity = (() => {
      const cutoffKey = sgtDateKey(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
      return s.dailyVisits
        .filter((v) => v.user_id === userId && v.visit_date >= cutoffKey)
        .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
        .map((v) => ({
          date: v.visit_date,
          pageViews: v.page_view_count,
          actions: s.actionEvents
            .filter(
              (a) =>
                a.user_id === userId && sgtDateKey(a.created_at) === v.visit_date
            )
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((a) => ({
              action: a.action,
              metadata: a.metadata,
              createdAt: a.created_at,
            })),
        }));
    })();

    return {
      userId,
      name: profile.display_name,
      metrics,
      hostedCount,
      kakiMemberships,
      lobangsSent,
      lobangsReceived,
      lastActiveAt,
      rsvpResponsivenessPct,
      dailyActivity,
    };
  },

  async reviewPlace(_userId, placeId, approve) {
    const s = store();
    const index = s.places.findIndex((p) => p.id === placeId);
    if (index === -1) throw new Error("That place does not exist");
    if (s.places[index].status !== "needs_review") {
      throw new Error("That place is not waiting for review");
    }

    s.places[index] = {
      ...s.places[index],
      status: approve ? "active" : "blocked",
      updated_at: new Date().toISOString(),
    };

    return enrich(s.places[index]);
  },

  // ---- Place flags ----

  async flagPlace(userId, placeId, reason, comment) {
    const s = store();
    const place = s.places.find((p) => p.id === placeId);
    if (!place) throw new Error("That place does not exist");

    const flag: PlaceFlag = {
      id: `demo-flag-${uuid().slice(0, 8)}`,
      place_id: placeId,
      flagged_by: userId,
      reason,
      comment: comment ?? null,
      status: "pending",
      resolution: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    };
    s.placeFlags.push(flag);

    return { ...flag, place_name: place.name, flagged_by_name: displayNameFor(userId) };
  },

  async listMyFlags(userId) {
    const s = store();
    return s.placeFlags
      .filter((f) => f.flagged_by === userId)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((f) => ({
        ...f,
        place_name: s.places.find((p) => p.id === f.place_id)?.name,
        flagged_by_name: displayNameFor(f.flagged_by),
      }));
  },

  async listPendingFlags() {
    const s = store();
    return s.placeFlags
      .filter((f) => f.status === "pending")
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
      .map((f) => ({
        ...f,
        place_name: s.places.find((p) => p.id === f.place_id)?.name,
        flagged_by_name: displayNameFor(f.flagged_by),
      }));
  },

  async resolvePlaceFlags(adminId, placeId, resolution, reason) {
    const admin = adminId === DEMO_USER_ID;
    if (!admin) throw new Error("Only an admin can resolve a flag");

    if (resolution === "blocked" && (!reason || reason.trim().length === 0)) {
      throw new Error("A reason is required to block a place");
    }

    const s = store();
    const pending = s.placeFlags.filter(
      (f) => f.place_id === placeId && f.status === "pending"
    );
    if (pending.length === 0) {
      throw new Error("At least one pending flag is required to resolve");
    }

    const now = new Date().toISOString();
    for (const flag of pending) {
      flag.status = "resolved";
      flag.resolution = resolution;
      flag.resolved_by = adminId;
      flag.resolved_at = now;
    }

    if (resolution === "blocked") {
      const index = s.places.findIndex((p) => p.id === placeId);
      if (index !== -1) {
        s.places[index] = { ...s.places[index], status: "blocked", updated_at: now };
        s.moderationLog.push({
          id: uuid(),
          place_id: placeId,
          actor_id: adminId,
          action: "block",
          reason: reason!.trim(),
          created_at: now,
        });
      }
    }
  },

  async createGeneralReport(userId, category, comment) {
    const report: GeneralReport = {
      id: `demo-report-${uuid().slice(0, 8)}`,
      reported_by: userId,
      category,
      comment: comment ?? null,
      status: "pending",
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    };
    store().generalReports.push(report);
    return { ...report, reported_by_name: displayNameFor(userId) };
  },

  async listPendingGeneralReports() {
    const s = store();
    return s.generalReports
      .filter((r) => r.status === "pending")
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
      .map((r) => ({ ...r, reported_by_name: displayNameFor(r.reported_by) }));
  },

  async resolveGeneralReport(adminId, reportId) {
    if (adminId !== DEMO_USER_ID) {
      throw new Error("Only an admin can resolve a report");
    }

    const s = store();
    const report = s.generalReports.find((r) => r.id === reportId);
    if (!report) throw new Error("Can't find that report — the link might be old.");
    if (report.status !== "pending") return;

    report.status = "resolved";
    report.resolved_by = adminId;
    report.resolved_at = new Date().toISOString();
  },

  async listDuplicateProfiles() {
    const s = store();
    const groups = new Map<
      string,
      { user_id: string; display_name: string; created_at?: string }[]
    >();
    for (const p of s.profiles) {
      const key = p.display_name.trim().toLowerCase();
      const bucket = groups.get(key);
      if (bucket) bucket.push(p);
      else groups.set(key, [p]);
    }
    return Array.from(groups.entries())
      .filter(([, accounts]) => accounts.length > 1)
      .map(([normalized_name, accounts]) => ({ normalized_name, accounts }));
  },

  async previewAccountMerge(userId) {
    const s = store();
    const profile = s.profiles.find((p) => p.user_id === userId);
    return {
      user_id: userId,
      display_name: profile?.display_name ?? "Unknown",
      counts: {
        "Jios hosted": s.events.filter((e) => e.host_id === userId).length,
        Votes: s.votes.filter((v) => v.user_id === userId).length,
        RSVPs: s.rsvps.filter((r) => r.user_id === userId).length,
        Invitations: s.invitees.filter((i) => i.user_id === userId).length,
        "Kaki groups created": s.kakis.filter((k) => k.created_by === userId)
          .length,
        "Kaki memberships": s.kakiMembers.filter((m) => m.user_id === userId)
          .length,
        "Wishlist saves": s.wishlist.filter((w) => w.user_id === userId)
          .length,
        "Visits logged": s.visits.filter((v) => v.user_id === userId).length,
        "Push subscriptions": s.pushSubscriptions.filter(
          (p) => p.user_id === userId
        ).length,
      },
    };
  },

  async mergeUserAccounts(callerId, keepUserId, mergeUserId) {
    if (keepUserId === mergeUserId) {
      throw new Error("Cannot merge an account into itself");
    }

    const isAdmin = await demoRepo.isAdmin(callerId);
    if (callerId !== keepUserId && !isAdmin) {
      throw new Error("You may only merge another account into your own");
    }

    const s = store();

    for (const e of s.events) {
      if (e.host_id === mergeUserId) e.host_id = keepUserId;
    }
    for (const k of s.kakis) {
      if (k.created_by === mergeUserId) k.created_by = keepUserId;
    }

    s.votes = s.votes.filter(
      (v) =>
        !(
          v.user_id === mergeUserId &&
          s.votes.some(
            (o) =>
              o.user_id === keepUserId &&
              o.event_id === v.event_id &&
              o.place_id === v.place_id
          )
        )
    );
    for (const v of s.votes) if (v.user_id === mergeUserId) v.user_id = keepUserId;

    s.rsvps = s.rsvps.filter(
      (r) =>
        !(
          r.user_id === mergeUserId &&
          s.rsvps.some((o) => o.user_id === keepUserId && o.event_id === r.event_id)
        )
    );
    for (const r of s.rsvps) if (r.user_id === mergeUserId) r.user_id = keepUserId;

    s.invitees = s.invitees.filter(
      (i) =>
        !(
          i.user_id === mergeUserId &&
          s.invitees.some(
            (o) => o.user_id === keepUserId && o.event_id === i.event_id
          )
        )
    );
    for (const i of s.invitees) if (i.user_id === mergeUserId) i.user_id = keepUserId;

    s.kakiMembers = s.kakiMembers.filter(
      (m) =>
        !(
          m.user_id === mergeUserId &&
          s.kakiMembers.some(
            (o) => o.user_id === keepUserId && o.kaki_id === m.kaki_id
          )
        )
    );
    for (const m of s.kakiMembers) {
      if (m.user_id === mergeUserId) m.user_id = keepUserId;
    }

    s.wishlist = s.wishlist.filter(
      (w) =>
        !(
          w.user_id === mergeUserId &&
          s.wishlist.some(
            (o) => o.user_id === keepUserId && o.place_id === w.place_id
          )
        )
    );
    for (const w of s.wishlist) if (w.user_id === mergeUserId) w.user_id = keepUserId;

    for (const v of s.visits) if (v.user_id === mergeUserId) v.user_id = keepUserId;
    for (const p of s.pushSubscriptions) {
      if (p.user_id === mergeUserId) p.user_id = keepUserId;
    }

    if (s.prefs.some((p) => p.user_id === keepUserId)) {
      s.prefs = s.prefs.filter((p) => p.user_id !== mergeUserId);
    } else {
      for (const p of s.prefs) if (p.user_id === mergeUserId) p.user_id = keepUserId;
    }

    // CHANGES_20260812.md §5 — the survivor's signup date should read as
    // continuous no matter which account happened to survive, since
    // admin analytics' "new users" chart reads this per account.
    const keepProfile = s.profiles.find((p) => p.user_id === keepUserId);
    const mergeProfile = s.profiles.find((p) => p.user_id === mergeUserId);
    if (keepProfile && mergeProfile?.created_at) {
      const mergeCreatedAt = new Date(mergeProfile.created_at).getTime();
      const keepCreatedAt = keepProfile.created_at
        ? new Date(keepProfile.created_at).getTime()
        : Infinity;
      if (mergeCreatedAt < keepCreatedAt) {
        keepProfile.created_at = mergeProfile.created_at;
      }
    }

    s.profiles = s.profiles.filter((p) => p.user_id !== mergeUserId);
    // Mirrors the real cascade: deleting the old auth.users row takes its
    // profiles row, recovery_token included, with it — so a stale link to
    // an already-merged account resolves to nothing, not a ghost.
    s.recoveryTokens = s.recoveryTokens.filter((t) => t.user_id !== mergeUserId);
  },

  async generateRecoveryToken(callerId, userId) {
    const isAdmin = await demoRepo.isAdmin(callerId);
    if (callerId !== userId && !isAdmin) {
      throw new Error("You may only get a recovery link for your own account");
    }

    const s = store();
    if (!s.profiles.some((p) => p.user_id === userId)) {
      throw new Error("That account does not exist");
    }

    const token = uuid();
    s.recoveryTokens = s.recoveryTokens.filter((t) => t.user_id !== userId);
    s.recoveryTokens.push({ user_id: userId, token });
    return token;
  },

  async resolveRecoveryToken(token) {
    const s = store();
    return s.recoveryTokens.find((t) => t.token === token)?.user_id ?? null;
  },

  async listCuisines() {
    const s = store();
    return [...s.cuisines].sort((a, b) => a.label.localeCompare(b.label));
  },

  async addCuisine(userId, label) {
    // Whether a non-admin may call this at all is `config.cuisineAddOpenToAnyone`,
    // checked by the API route — repos stay config-agnostic, same reasoning
    // `nameClaimEnabled` is checked in `nameAuth.ts` rather than here.
    const trimmed = label.trim();
    if (!trimmed) throw new Error("Put in a cuisine name");

    const slug = slugifyCuisine(trimmed);
    if (!slug) throw new Error("Put in a cuisine name");

    const s = store();
    const existing = s.cuisines.find((c) => c.slug === slug);
    if (existing) return existing;

    const created: CuisineOption = {
      slug,
      label: trimmed,
      added_by: userId,
      created_at: new Date().toISOString(),
    };
    s.cuisines.push(created);
    return created;
  },

  async previewCuisineMerge(slugs) {
    const s = store();
    return slugs.map((slug) => {
      const cuisine = s.cuisines.find((c) => c.slug === slug);
      return {
        slug,
        label: cuisine?.label ?? slug,
        place_count: s.places.filter((p) => p.cuisine.includes(slug)).length,
        profile_count: s.prefs.filter(
          (p) =>
            p.cuisine_likes.includes(slug) || p.cuisine_dislikes.includes(slug)
        ).length,
      };
    });
  },

  async mergeCuisines(callerId, keepSlug, mergeSlug) {
    if (keepSlug === mergeSlug) {
      throw new Error("Cannot merge a cuisine into itself");
    }

    const isAdmin = await demoRepo.isAdmin(callerId);
    if (!isAdmin) throw new Error("Admins only");

    const s = store();
    const dedupeReplace = (tags: string[]) =>
      Array.from(
        new Set(tags.map((t) => (t === mergeSlug ? keepSlug : t)))
      );

    for (const place of s.places) {
      if (place.cuisine.includes(mergeSlug)) {
        place.cuisine = dedupeReplace(place.cuisine);
      }
    }
    for (const pref of s.prefs) {
      if (pref.cuisine_likes.includes(mergeSlug)) {
        pref.cuisine_likes = dedupeReplace(pref.cuisine_likes);
      }
      if (pref.cuisine_dislikes.includes(mergeSlug)) {
        pref.cuisine_dislikes = dedupeReplace(pref.cuisine_dislikes);
      }
    }
    s.cuisines = s.cuisines.filter((c) => c.slug !== mergeSlug);
  },

  async generatePersonalInviteToken(callerId, userId) {
    const isAdmin = await demoRepo.isAdmin(callerId);
    if (callerId !== userId && !isAdmin) {
      throw new Error("You may only get a personal invite link for your own account");
    }

    const s = store();
    if (!s.profiles.some((p) => p.user_id === userId)) {
      throw new Error("That account does not exist");
    }

    const token = uuid();
    s.discoveryTokens = s.discoveryTokens.filter((t) => t.user_id !== userId);
    s.discoveryTokens.push({ user_id: userId, token });
    return token;
  },

  async resolvePersonalInvite(token): Promise<PersonalInvite | null> {
    const s = store();
    const entry = s.discoveryTokens.find((t) => t.token === token);
    if (!entry) return null;
    const profile = s.profiles.find((p) => p.user_id === entry.user_id);
    if (!profile) return null;
    return { user_id: profile.user_id, display_name: profile.display_name };
  },

  async listAllUserIds() {
    return store().profiles.map((p) => p.user_id);
  },

  async listAllKakiIds() {
    return store().kakis.map((k) => k.id);
  },

  async saveUserFoodIdentitySnapshot(
    userId: string,
    month: string,
    card: FoodIdentityCard
  ) {
    const s = store();
    const row = {
      user_id: userId,
      ...card,
      month,
      computed_at: new Date().toISOString(),
    };
    const index = s.userFoodIdentitySnapshots.findIndex(
      (r) => r.month === month && r.user_id === userId
    );
    if (index === -1) {
      s.userFoodIdentitySnapshots.push(row);
    } else {
      s.userFoodIdentitySnapshots[index] = row;
    }
  },

  async listUserFoodIdentitySnapshots(userId: string) {
    return store()
      .userFoodIdentitySnapshots.filter((row) => row.user_id === userId)
      .sort((a, b) => b.month.localeCompare(a.month));
  },

  async saveKakiFoodIdentitySnapshot(
    kakiId: string,
    month: string,
    card: KakiFoodIdentityCard
  ) {
    const s = store();
    const row = {
      kaki_id: kakiId,
      ...card,
      month,
      computed_at: new Date().toISOString(),
    };
    const index = s.kakiFoodIdentitySnapshots.findIndex(
      (r) => r.month === month && r.kaki_id === kakiId
    );
    if (index === -1) {
      s.kakiFoodIdentitySnapshots.push(row);
    } else {
      s.kakiFoodIdentitySnapshots[index] = row;
    }
  },

  async listKakiFoodIdentitySnapshots(kakiId: string) {
    return store()
      .kakiFoodIdentitySnapshots.filter((row) => row.kaki_id === kakiId)
      .sort((a, b) => b.month.localeCompare(a.month));
  },

  async trackDailyVisit(userId, visitDate) {
    const s = store();
    const now = new Date().toISOString();
    const existing = s.dailyVisits.find(
      (v) => v.user_id === userId && v.visit_date === visitDate
    );
    if (existing) {
      existing.page_view_count += 1;
      existing.last_seen_at = now;
    } else {
      s.dailyVisits.push({
        user_id: userId,
        visit_date: visitDate,
        page_view_count: 1,
        first_seen_at: now,
        last_seen_at: now,
      });
    }
  },

  async logAction(userId, action, metadata = null) {
    store().actionEvents.push({
      id: uuid(),
      user_id: userId,
      action,
      metadata,
      created_at: new Date().toISOString(),
    });
  },
};

export default demoRepo;
