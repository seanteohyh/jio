import {
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
  sortPlacesForList,
  uuid,
} from "@/lib/utils";
import { pickCommitteeSuggestions } from "@/lib/suggestCommittee";
import { computeWinner } from "@/lib/voting";
import { rankPlaces } from "@/lib/recommend";
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
  EventCandidateDate,
  EventDateVote,
  EventDetail,
  EventInvitee,
  EventOption,
  EventRsvp,
  EventVote,
  Filters,
  FlagReason,
  FlagResolution,
  Kaki,
  KakiDetail,
  KakiMember,
  Lobang,
  LobangTarget,
  LunchEvent,
  MemberData,
  ModerationLogEntry,
  Office,
  Place,
  PlaceFlag,
  Profile,
  RecurringSeries,
  RsvpResponse,
  TeamUser,
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
  lobangs: Lobang[];
  /** Recipients, snapshotted at send time. */
  lobangRecipients: { lobang_id: string; user_id: string; seen_at: string | null }[];
  kakis: Kaki[];
  kakiMembers: KakiMember[];
  walkCache: WalkCacheEntry[];
  moderationLog: ModerationLogEntry[];
  placeFlags: PlaceFlag[];
  recurringSeries: RecurringSeries[];
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
    lobangs: demoLobangs.map((l) => ({ ...l })),
    lobangRecipients: demoLobangRecipients.map((r) => ({ ...r })),
    kakis: demoKakis.map((k) => ({ ...k })),
    kakiMembers: demoKakiMembers.map((m) => ({ ...m })),
    walkCache: [],
    moderationLog: [],
    placeFlags: [],
    recurringSeries: [],
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

/**
 * Attach the numbers that are computed rather than stored: distance and walk
 * time from the active office, and the rating aggregates.
 */
function enrich(place: Place, officeId: string = DEFAULT_OFFICE.id): Place {
  const s = store();
  const visits = s.visits.filter((v) => v.place_id === place.id);
  const rated = visits.filter((v) => typeof v.rating === "number");

  const cached = s.walkCache.find(
    (w) => w.place_id === place.id && w.office_id === officeId
  );

  let walkMinutes = cached?.walk_minutes;
  let distanceM = cached?.distance_m;

  if (walkMinutes === undefined) {
    const office = s.offices.find((o) => o.id === officeId) ?? DEFAULT_OFFICE;
    const distance = haversine(office.lat, office.lng, place.lat, place.lng);
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

  async createPlace(data) {
    const now = new Date().toISOString();
    const place: Place = {
      ...data,
      id: `demo-place-${uuid().slice(0, 8)}`,
      created_at: now,
      updated_at: now,
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
    // (office_id isn't a field on Place at all today, so there's nothing to
    // strip for it yet — if a place ever becomes reassignable to a different
    // office, extend this same guard.)
    const { status: _status, ...safeData } = data;
    s.places[index] = {
      ...s.places[index],
      ...safeData,
      id,
      updated_at: new Date().toISOString(),
    };
    return enrich(s.places[index]);
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
    };
    store().visits.push(visit);
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
    return next;
  },

  async deleteVisit(id, userId) {
    const visits = store().visits;
    const index = visits.findIndex((v) => v.id === id);
    if (index === -1 || visits[index].user_id !== userId) {
      throw new Error("That visit is not yours to delete");
    }
    visits.splice(index, 1);
  },

  async listPublicReviews(placeId) {
    return store()
      .visits.filter((v) => v.place_id === placeId && v.is_public)
      .map((v) => ({ ...v, display_name: displayNameFor(v.user_id) }))
      .sort((a, b) => b.visited_at.localeCompare(a.visited_at));
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

  async getDisplayNames(userIds) {
    const map = new Map<string, string>();
    for (const id of userIds) map.set(id, displayNameFor(id));
    return map;
  },

  async listAllUsers(query, officeId) {
    const s = store();
    const ids = new Set<string>([
      DEMO_USER_ID,
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_B,
      ...s.profiles.map((p) => p.user_id),
    ]);

    let users: TeamUser[] = Array.from(ids).map((id) => ({
      user_id: id,
      display_name: displayNameFor(id),
    }));

    if (officeId) {
      users = users.filter((u) => {
        const prefsOffice = s.prefs.find((p) => p.user_id === u.user_id)
          ?.default_office_id;
        return (prefsOffice ?? DEFAULT_OFFICE.id) === officeId;
      });
    }

    const q = query?.trim().toLowerCase();
    if (q) {
      users = users.filter((u) => u.display_name.toLowerCase().includes(q));
    }

    return users.sort((a, b) => a.display_name.localeCompare(b.display_name));
  },

  // ---- Lunch events ----

  async createEvent(
    hostId,
    title,
    scheduledAt,
    officeId,
    placeIds,
    kakiId,
    inviteeIds
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

  async createFlexiEvent(hostId, title, officeId, candidateDates, kakiId, inviteeIds) {
    const uniqueDates = Array.from(new Set(candidateDates));
    if (uniqueDates.length < 2) {
      throw new Error("A Flexi Jio needs at least 2 candidate dates");
    }

    const s = store();
    const earliest = [...uniqueDates].sort()[0];
    const event: LunchEvent = {
      id: `demo-event-${uuid().slice(0, 8)}`,
      office_id: officeId,
      host_id: hostId,
      title,
      scheduled_at: earliest,
      status: "open",
      invite_token: generateToken(),
      winner_place_id: null,
      kaki_id: kakiId ?? null,
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
    if (!event) throw new Error("Event not found");
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

  async addOptionToEvent(eventId, placeId, userId) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Event not found");
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
    if (!event) throw new Error("Event not found");
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
    if (!event) throw new Error("Event not found");

    const option = s.options.find(
      (o) => o.event_id === eventId && o.place_id === oldPlaceId
    );
    if (!option) throw new Error("That option does not exist");
    if (option.label == null) {
      throw new Error("That option is already a real place");
    }

    if (event.host_id !== userId && option.added_by !== userId) {
      throw new Error(
        "Only whoever added this option, or the host, can attach a place to it"
      );
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
    if (!event) throw new Error("Event not found");
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
    if (!event) throw new Error("Event not found");
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
    if (!event) throw new Error("Event not found");
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
    if (!event) throw new Error("Event not found");
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
    if (!event) throw new Error("Event not found");
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
    if (index === -1) throw new Error("Event not found");
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

    s.events[index] = {
      ...event,
      scheduled_at: date,
      date_phase: "confirmed",
    };

    return s.events[index];
  },

  async rsvp(eventId, userId, response) {
    const s = store();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Event not found");

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
    if (!event) throw new Error("Event not found");
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
    };

    const detail = await demoRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while closing");
    return detail;
  },

  async cancelEvent(eventId, hostId) {
    const s = store();
    const index = s.events.findIndex((e) => e.id === eventId);
    if (index === -1) throw new Error("Event not found");
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
    if (!detail) throw new Error("Event vanished while cancelling");
    return detail;
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

  async generateDueOccurrences(hostId) {
    const s = store();
    const due = s.recurringSeries.filter(
      (series) => series.host_id === hostId && series.status === "active"
    );
    if (due.length === 0) return 0;

    let generated = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

      const [hh, mm] = series.time_of_day.split(":").map(Number);
      const scheduledAt = new Date(next);
      scheduledAt.setHours(hh, mm, 0, 0);

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

  async createKaki(userId, name) {
    const s = store();
    const kaki: Kaki = {
      id: `demo-kaki-${uuid().slice(0, 8)}`,
      name,
      created_by: userId,
      invite_token: generateToken(),
      created_at: new Date().toISOString(),
    };
    s.kakis.push(kaki);
    s.kakiMembers.push({
      kaki_id: kaki.id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    });
    return { ...kaki, member_count: 1 };
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

  // ---- Lobangs ----

  async sendLobang(fromUserId, target, placeId, note, eventId) {
    const s = store();
    let recipientIds: string[];
    let kakiId: string | null = null;

    if (target.type === "kaki") {
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
    if (recipientIds.length === 0) {
      throw new Error("At least one recipient is required");
    }

    const lobang: Lobang = {
      id: `demo-lobang-${uuid().slice(0, 8)}`,
      from_user_id: fromUserId,
      place_id: placeId,
      note: note ?? null,
      event_id: eventId ?? null,
      kaki_id: kakiId,
      created_at: new Date().toISOString(),
    };
    s.lobangs.push(lobang);
    for (const userId of recipientIds) {
      s.lobangRecipients.push({ lobang_id: lobang.id, user_id: userId, seen_at: null });
    }

    return hydrateSentLobang(lobang);
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
      .lobangs.filter((l) => l.from_user_id === userId)
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
};

export default demoRepo;
