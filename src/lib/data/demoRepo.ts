import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { estimateWalkMinutes, generateToken, haversine, uuid } from "@/lib/utils";
import { computeWinner } from "@/lib/voting";
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
  demoOffices,
  demoProfiles,
  demoRecos,
  demoUserPrefs,
  demoWishlist,
} from "./demoData";
import type { Repo } from "./index";
import type {
  EventDetail,
  EventInvitee,
  EventOption,
  EventRsvp,
  EventVote,
  Filters,
  Kaki,
  KakiDetail,
  KakiMember,
  LunchEvent,
  Office,
  Place,
  Profile,
  Reco,
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
  wishlist: WishlistEntry[];
  recos: Reco[];
  kakis: Kaki[];
  kakiMembers: KakiMember[];
  walkCache: WalkCacheEntry[];
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
    wishlist: demoWishlist.map((w) => ({ ...w })),
    recos: demoRecos.map((r) => ({ ...r })),
    kakis: demoKakis.map((k) => ({ ...k })),
    kakiMembers: demoKakiMembers.map((m) => ({ ...m })),
    walkCache: [],
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

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export const demoRepo: Repo = {
  // ---- Places ----

  async listPlaces(filters) {
    const officeId = filters?.officeId ?? DEFAULT_OFFICE.id;
    const enriched = store().places.map((p) => enrich(p, officeId));
    const filtered = applyFilters(enriched, filters);
    return filtered.sort((a, b) => (a.walk_minutes ?? 0) - (b.walk_minutes ?? 0));
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
    s.places[index] = {
      ...s.places[index],
      ...data,
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
    s.recos = s.recos.filter((r) => r.place_id !== id);
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

  async getDisplayNames(userIds) {
    const map = new Map<string, string>();
    for (const id of userIds) map.set(id, displayNameFor(id));
    return map;
  },

  async listAllUsers() {
    const ids = new Set<string>([
      DEMO_USER_ID,
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_B,
      ...store().profiles.map((p) => p.user_id),
    ]);
    const users: TeamUser[] = Array.from(ids).map((id) => ({
      user_id: id,
      display_name: displayNameFor(id),
    }));
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

    return {
      ...event,
      host_name: displayNameFor(event.host_id),
      option_count: options.length,
      going_count: rsvps.filter((r) => r.response === "yes").length,
      winner_place_name: event.winner_place_id
        ? s.places.find((p) => p.id === event.winner_place_id)?.name ?? null
        : null,
      options,
      votes: s.votes.filter((v) => v.event_id === event.id),
      rsvps,
      invitees,
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

    s.options.push({ event_id: eventId, place_id: placeId, added_by: userId });
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

  // ---- Recos ----

  async createReco(userId, placeId, comment) {
    const s = store();
    const existing = s.recos.find(
      (r) => r.user_id === userId && r.place_id === placeId
    );
    if (existing) {
      existing.comment = comment ?? null;
      return { ...existing, display_name: displayNameFor(userId) };
    }
    const reco: Reco = {
      id: `demo-reco-${uuid().slice(0, 8)}`,
      place_id: placeId,
      user_id: userId,
      comment: comment ?? null,
      created_at: new Date().toISOString(),
    };
    s.recos.push(reco);
    return { ...reco, display_name: displayNameFor(userId) };
  },

  async deleteReco(userId, placeId) {
    const s = store();
    s.recos = s.recos.filter(
      (r) => !(r.user_id === userId && r.place_id === placeId)
    );
  },

  async listRecos(limit = 20) {
    const s = store();
    return s.recos
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, limit)
      .map((r) => {
        const place = s.places.find((p) => p.id === r.place_id);
        return {
          ...r,
          display_name: displayNameFor(r.user_id),
          place: place ? enrich(place) : undefined,
        };
      });
  },

  async listRecosForPlace(placeId) {
    return store()
      .recos.filter((r) => r.place_id === placeId)
      .map((r) => ({ ...r, display_name: displayNameFor(r.user_id) }))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
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
};

export default demoRepo;
