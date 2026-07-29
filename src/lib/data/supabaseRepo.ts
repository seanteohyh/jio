import { DEFAULT_OFFICE } from "@/lib/constants";
import { estimateWalkMinutes, generateToken, haversine } from "@/lib/utils";
import { computeWinner } from "@/lib/voting";
import { createAuthServerClient } from "@/lib/supabase/serverAuth";
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
  TeamUser,
  UserPrefs,
  Visit,
  WalkCacheEntry,
  WishlistEntry,
} from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Postgres implementation, via Supabase.
 *
 * Every query here runs through the cookie-backed anon-key client, which means
 * Row Level Security applies to all of it. The policies in
 * `supabase/migrations/007_rls.sql` and friends are the real access control;
 * the checks in this file exist to produce good error messages, not to be the
 * only thing standing between a user and someone else's data.
 */

async function db(): Promise<SupabaseClient> {
  return createAuthServerClient();
}

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(`${message}${error?.message ? `: ${error.message}` : ""}`);
}

// ---------------------------------------------------------------------------
// Enrichment helpers
// ---------------------------------------------------------------------------

interface RatingAggregate {
  avg_rating: number | null;
  visit_count: number;
}

/**
 * Rating aggregates, computed in the app rather than the database.
 *
 * Fine at team scale. If this app ever holds tens of thousands of visits, this
 * is the first thing to replace with a materialised view — see the note in
 * README under "Known limits".
 */
async function ratingAggregates(
  client: SupabaseClient,
  placeIds: string[]
): Promise<Map<string, RatingAggregate>> {
  const map = new Map<string, RatingAggregate>();
  if (placeIds.length === 0) return map;

  const { data, error } = await client
    .from("visits")
    .select("place_id, rating")
    .in("place_id", placeIds);

  if (error || !data) return map;

  const totals = new Map<string, { sum: number; rated: number; count: number }>();
  for (const row of data as { place_id: string; rating: number | null }[]) {
    const entry = totals.get(row.place_id) || { sum: 0, rated: 0, count: 0 };
    entry.count += 1;
    if (typeof row.rating === "number") {
      entry.sum += row.rating;
      entry.rated += 1;
    }
    totals.set(row.place_id, entry);
  }

  for (const [placeId, entry] of totals) {
    map.set(placeId, {
      avg_rating: entry.rated > 0 ? entry.sum / entry.rated : null,
      visit_count: entry.count,
    });
  }

  return map;
}

/** Walk times from the cache, falling back to straight-line estimates. */
async function walkTimes(
  client: SupabaseClient,
  officeId: string,
  places: Place[]
): Promise<Map<string, { walk_minutes: number; distance_m: number }>> {
  const map = new Map<string, { walk_minutes: number; distance_m: number }>();

  const { data } = await client
    .from("walk_cache")
    .select("place_id, walk_minutes, distance_m")
    .eq("office_id", officeId);

  for (const row of (data ?? []) as {
    place_id: string;
    walk_minutes: number;
    distance_m: number;
  }[]) {
    map.set(row.place_id, {
      walk_minutes: row.walk_minutes,
      distance_m: row.distance_m,
    });
  }

  // Anything the cache does not cover gets a haversine estimate so the UI is
  // never missing a walk time.
  const missing = places.filter((p) => !map.has(p.id));
  if (missing.length > 0) {
    const { data: officeRow } = await client
      .from("offices")
      .select("lat, lng")
      .eq("id", officeId)
      .maybeSingle();

    const office = (officeRow as { lat: number; lng: number } | null) ?? {
      lat: DEFAULT_OFFICE.lat,
      lng: DEFAULT_OFFICE.lng,
    };

    for (const place of missing) {
      const distance = haversine(office.lat, office.lng, place.lat, place.lng);
      map.set(place.id, {
        walk_minutes: estimateWalkMinutes(distance),
        distance_m: Math.round(distance),
      });
    }
  }

  return map;
}

async function displayNameMap(
  client: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;

  const { data } = await client
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", unique);

  for (const row of (data ?? []) as Profile[]) {
    map.set(row.user_id, row.display_name);
  }

  // Anyone without a profile row still needs a label.
  for (const id of unique) {
    if (!map.has(id)) map.set(id, `Teammate ${id.slice(0, 6)}`);
  }

  return map;
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export const supabaseRepo: Repo = {
  // ---- Places ----

  async listPlaces(filters?: Partial<Filters>) {
    const client = await db();
    const officeId = filters?.officeId ?? DEFAULT_OFFICE.id;

    let query = client.from("places").select("*");

    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    } else if (!filters?.status) {
      query = query.eq("status", "active");
    }

    if (filters?.cuisines && filters.cuisines.length > 0) {
      query = query.overlaps("cuisine", filters.cuisines);
    }
    if (typeof filters?.budgetMin === "number") {
      query = query.gte("budget_tier", filters.budgetMin);
    }
    if (typeof filters?.budgetMax === "number") {
      query = query.lte("budget_tier", filters.budgetMax);
    }
    if (filters?.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) fail("Could not load places", error);

    const places = (data ?? []) as Place[];
    const ids = places.map((p) => p.id);

    const [aggregates, walks] = await Promise.all([
      ratingAggregates(client, ids),
      walkTimes(client, officeId, places),
    ]);

    let enriched = places.map((place) => {
      const walk = walks.get(place.id);
      const aggregate = aggregates.get(place.id);
      return {
        ...place,
        walk_minutes: walk?.walk_minutes ?? null,
        distance_m: walk?.distance_m ?? null,
        avg_rating: aggregate?.avg_rating ?? null,
        visit_count: aggregate?.visit_count ?? 0,
      };
    });

    // Walk time is not a column, so this filter has to happen after enrichment.
    if (typeof filters?.maxWalkMinutes === "number") {
      enriched = enriched.filter(
        (p) =>
          typeof p.walk_minutes !== "number" ||
          p.walk_minutes <= filters.maxWalkMinutes!
      );
    }

    return enriched.sort(
      (a, b) => (a.walk_minutes ?? 999) - (b.walk_minutes ?? 999)
    );
  },

  async getPlace(id) {
    const client = await db();
    const { data, error } = await client
      .from("places")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) fail("Could not load that place", error);
    if (!data) return null;

    const place = data as Place;
    const [aggregates, walks] = await Promise.all([
      ratingAggregates(client, [place.id]),
      walkTimes(client, DEFAULT_OFFICE.id, [place]),
    ]);

    const walk = walks.get(place.id);
    const aggregate = aggregates.get(place.id);

    return {
      ...place,
      walk_minutes: walk?.walk_minutes ?? null,
      distance_m: walk?.distance_m ?? null,
      avg_rating: aggregate?.avg_rating ?? null,
      visit_count: aggregate?.visit_count ?? 0,
    };
  },

  async createPlace(data) {
    const client = await db();
    const { data: row, error } = await client
      .from("places")
      .insert(data)
      .select()
      .single();

    if (error) fail("Could not add that place", error);
    return row as Place;
  },

  async updatePlace(id, data) {
    const client = await db();
    const patch = { ...data, updated_at: new Date().toISOString() };
    delete (patch as Record<string, unknown>).id;
    delete (patch as Record<string, unknown>).walk_minutes;
    delete (patch as Record<string, unknown>).distance_m;
    delete (patch as Record<string, unknown>).avg_rating;
    delete (patch as Record<string, unknown>).visit_count;

    const { data: row, error } = await client
      .from("places")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) fail("Could not update that place", error);
    return row as Place;
  },

  async deletePlace(id) {
    const client = await db();
    const { error } = await client.from("places").delete().eq("id", id);
    if (error) fail("Could not delete that place", error);
  },

  // ---- Visits & reviews ----

  async listVisits(placeId, userId) {
    const client = await db();
    let query = client
      .from("visits")
      .select("*")
      .order("visited_at", { ascending: false });

    if (placeId) query = query.eq("place_id", placeId);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) fail("Could not load visits", error);

    const visits = (data ?? []) as Visit[];
    if (visits.length === 0) return [];

    const names = await displayNameMap(
      client,
      visits.map((v) => v.user_id)
    );

    const { data: placeRows } = await client
      .from("places")
      .select("id, name")
      .in("id", Array.from(new Set(visits.map((v) => v.place_id))));

    const placeNames = new Map(
      ((placeRows ?? []) as { id: string; name: string }[]).map((p) => [
        p.id,
        p.name,
      ])
    );

    return visits.map((v) => ({
      ...v,
      display_name: names.get(v.user_id),
      place_name: placeNames.get(v.place_id),
    }));
  },

  async createVisit(data) {
    const client = await db();
    const { data: row, error } = await client
      .from("visits")
      .insert(data)
      .select()
      .single();

    if (error) fail("Could not log that visit", error);
    return row as Visit;
  },

  async listPublicReviews(placeId) {
    const client = await db();
    const { data, error } = await client
      .from("visits")
      .select("*")
      .eq("place_id", placeId)
      .eq("is_public", true)
      .order("visited_at", { ascending: false });

    if (error) fail("Could not load reviews", error);

    const visits = (data ?? []) as Visit[];
    const names = await displayNameMap(
      client,
      visits.map((v) => v.user_id)
    );

    return visits.map((v) => ({ ...v, display_name: names.get(v.user_id) }));
  },

  // ---- Walk cache & offices ----

  async getWalkCache(officeId) {
    const client = await db();
    const { data, error } = await client
      .from("walk_cache")
      .select("*")
      .eq("office_id", officeId);

    if (error) fail("Could not load walk times", error);
    return (data ?? []) as WalkCacheEntry[];
  },

  async upsertWalkCache(entries) {
    if (entries.length === 0) return;
    const client = await db();
    const { error } = await client
      .from("walk_cache")
      .upsert(entries, { onConflict: "office_id,place_id" });

    if (error) fail("Could not save walk times", error);
  },

  async listOffices() {
    const client = await db();
    const { data, error } = await client
      .from("offices")
      .select("*")
      .order("name");

    if (error) fail("Could not load offices", error);
    return (data ?? []) as Office[];
  },

  async createOffice(data) {
    const client = await db();
    const { data: row, error } = await client
      .from("offices")
      .insert(data)
      .select()
      .single();

    if (error) fail("Could not add that office", error);
    return row as Office;
  },

  // ---- User preferences ----

  async getUserPrefs(userId) {
    const client = await db();
    const { data, error } = await client
      .from("user_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) fail("Could not load your preferences", error);
    return (data as UserPrefs | null) ?? null;
  },

  async upsertUserPrefs(prefs) {
    const client = await db();
    const { data, error } = await client
      .from("user_prefs")
      .upsert(prefs, { onConflict: "user_id" })
      .select()
      .single();

    if (error) fail("Could not save your preferences", error);
    return data as UserPrefs;
  },

  // ---- Profiles ----

  async getProfile(userId) {
    const client = await db();
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) fail("Could not load that profile", error);
    return (data as Profile | null) ?? null;
  },

  async upsertProfile(userId, displayName) {
    const client = await db();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        { user_id: userId, display_name: displayName },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) fail("Could not save your display name", error);
    return data as Profile;
  },

  async getDisplayNames(userIds) {
    const client = await db();
    return displayNameMap(client, userIds);
  },

  async listAllUsers() {
    const client = await db();
    const { data, error } = await client
      .from("profiles")
      .select("user_id, display_name")
      .order("display_name");

    if (error) fail("Could not load the team list", error);
    return (data ?? []) as TeamUser[];
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
    const client = await db();

    const { data: eventRow, error } = await client
      .from("lunch_events")
      .insert({
        host_id: hostId,
        title,
        scheduled_at: scheduledAt,
        office_id: officeId,
        kaki_id: kakiId ?? null,
        invite_token: generateToken(),
        status: "open",
      })
      .select()
      .single();

    if (error) fail("Could not create that Jio", error);
    const event = eventRow as LunchEvent;

    if (placeIds.length > 0) {
      const { error: optionError } = await client.from("event_options").insert(
        placeIds.map((placeId) => ({
          event_id: event.id,
          place_id: placeId,
          added_by: hostId,
        }))
      );
      if (optionError) fail("Could not add the place options", optionError);
    }

    const invitees = (inviteeIds ?? []).filter((id) => id !== hostId);
    if (invitees.length > 0) {
      const { error: inviteeError } = await client
        .from("event_invitees")
        .insert(
          invitees.map((userId) => ({ event_id: event.id, user_id: userId }))
        );
      if (inviteeError) fail("Could not add invitees", inviteeError);
    }

    return event;
  },

  async getEvent(idOrToken) {
    const client = await db();

    // An id and an invite token are both opaque strings to the caller, so try
    // the id first and fall back to the token.
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrToken
      );

    let eventRow: LunchEvent | null = null;

    if (looksLikeUuid) {
      const { data } = await client
        .from("lunch_events")
        .select("*")
        .eq("id", idOrToken)
        .maybeSingle();
      eventRow = (data as LunchEvent | null) ?? null;
    }

    if (!eventRow) {
      const { data } = await client
        .from("lunch_events")
        .select("*")
        .eq("invite_token", idOrToken)
        .maybeSingle();
      eventRow = (data as LunchEvent | null) ?? null;
    }

    if (!eventRow) return null;
    const event = eventRow;

    const [optionsRes, votesRes, rsvpsRes, inviteesRes] = await Promise.all([
      client.from("event_options").select("*").eq("event_id", event.id),
      client.from("event_votes").select("*").eq("event_id", event.id),
      client.from("event_rsvps").select("*").eq("event_id", event.id),
      client.from("event_invitees").select("*").eq("event_id", event.id),
    ]);

    const optionRows = (optionsRes.data ?? []) as EventOption[];
    const votes = (votesRes.data ?? []) as EventVote[];
    const rsvpRows = (rsvpsRes.data ?? []) as EventRsvp[];
    const inviteeRows = (inviteesRes.data ?? []) as EventInvitee[];

    const placeIds = optionRows.map((o) => o.place_id);
    const winnerId = event.winner_place_id;
    const allPlaceIds = winnerId ? [...placeIds, winnerId] : placeIds;

    const { data: placeRows } =
      allPlaceIds.length > 0
        ? await client.from("places").select("*").in("id", allPlaceIds)
        : { data: [] as Place[] };

    const places = (placeRows ?? []) as Place[];
    const walks = await walkTimes(client, event.office_id, places);
    const placeById = new Map(
      places.map((p) => {
        const walk = walks.get(p.id);
        return [
          p.id,
          {
            ...p,
            walk_minutes: walk?.walk_minutes ?? null,
            distance_m: walk?.distance_m ?? null,
          } as Place,
        ];
      })
    );

    const names = await displayNameMap(client, [
      event.host_id,
      ...optionRows.map((o) => o.added_by),
      ...rsvpRows.map((r) => r.user_id),
      ...inviteeRows.map((i) => i.user_id),
    ]);

    const options: EventOption[] = optionRows.map((o) => ({
      ...o,
      place: placeById.get(o.place_id),
      added_by_name: names.get(o.added_by),
    }));

    const rsvps: EventRsvp[] = rsvpRows.map((r) => ({
      ...r,
      display_name: names.get(r.user_id),
    }));

    const invitees: EventInvitee[] = inviteeRows.map((i) => ({
      ...i,
      display_name: names.get(i.user_id),
    }));

    // Live Borda tally, so the UI can show the standing without closing.
    const tally: Record<string, number> = {};
    for (const id of placeIds) tally[id] = 0;
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

    const detail: EventDetail = {
      ...event,
      host_name: names.get(event.host_id),
      option_count: options.length,
      going_count: rsvps.filter((r) => r.response === "yes").length,
      winner_place_name: winnerId
        ? placeById.get(winnerId)?.name ?? null
        : null,
      options,
      votes,
      rsvps,
      invitees,
      tally,
    };

    return detail;
  },

  async listEvents(userId) {
    const client = await db();

    const [kakiRes, inviteeRes, voteRes, rsvpRes] = await Promise.all([
      client.from("kaki_members").select("kaki_id").eq("user_id", userId),
      client.from("event_invitees").select("event_id").eq("user_id", userId),
      client.from("event_votes").select("event_id").eq("user_id", userId),
      client.from("event_rsvps").select("event_id").eq("user_id", userId),
    ]);

    const kakiIds = ((kakiRes.data ?? []) as { kaki_id: string }[]).map(
      (r) => r.kaki_id
    );
    const relatedEventIds = Array.from(
      new Set([
        ...((inviteeRes.data ?? []) as { event_id: string }[]).map(
          (r) => r.event_id
        ),
        ...((voteRes.data ?? []) as { event_id: string }[]).map(
          (r) => r.event_id
        ),
        ...((rsvpRes.data ?? []) as { event_id: string }[]).map(
          (r) => r.event_id
        ),
      ])
    );

    // Three narrow queries beat one query with a giant OR: each one hits an
    // index, and none of them depends on PostgREST's `or()` string syntax
    // behaving with empty lists.
    const queries = [
      client.from("lunch_events").select("*").eq("host_id", userId),
    ];
    if (kakiIds.length > 0) {
      queries.push(
        client.from("lunch_events").select("*").in("kaki_id", kakiIds)
      );
    }
    if (relatedEventIds.length > 0) {
      queries.push(
        client.from("lunch_events").select("*").in("id", relatedEventIds)
      );
    }

    const results = await Promise.all(queries);

    const byId = new Map<string, LunchEvent>();
    for (const result of results) {
      for (const row of (result.data ?? []) as LunchEvent[]) {
        byId.set(row.id, row);
      }
    }

    const events = Array.from(byId.values());
    if (events.length === 0) return [];

    const eventIds = events.map((e) => e.id);
    const [optionCountRes, rsvpCountRes, namesMap] = await Promise.all([
      client.from("event_options").select("event_id").in("event_id", eventIds),
      client
        .from("event_rsvps")
        .select("event_id, response")
        .in("event_id", eventIds),
      displayNameMap(
        client,
        events.map((e) => e.host_id)
      ),
    ]);

    const optionCounts = new Map<string, number>();
    for (const row of (optionCountRes.data ?? []) as { event_id: string }[]) {
      optionCounts.set(row.event_id, (optionCounts.get(row.event_id) ?? 0) + 1);
    }

    const goingCounts = new Map<string, number>();
    for (const row of (rsvpCountRes.data ?? []) as {
      event_id: string;
      response: string;
    }[]) {
      if (row.response !== "yes") continue;
      goingCounts.set(row.event_id, (goingCounts.get(row.event_id) ?? 0) + 1);
    }

    const winnerIds = events
      .map((e) => e.winner_place_id)
      .filter((id): id is string => Boolean(id));
    const winnerNames = new Map<string, string>();
    if (winnerIds.length > 0) {
      const { data } = await client
        .from("places")
        .select("id, name")
        .in("id", winnerIds);
      for (const row of (data ?? []) as { id: string; name: string }[]) {
        winnerNames.set(row.id, row.name);
      }
    }

    return events
      .map((e) => ({
        ...e,
        host_name: namesMap.get(e.host_id),
        option_count: optionCounts.get(e.id) ?? 0,
        going_count: goingCounts.get(e.id) ?? 0,
        winner_place_name: e.winner_place_id
          ? winnerNames.get(e.winner_place_id) ?? null
          : null,
      }))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  async addInviteesToEvent(eventId, userIds, hostId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("host_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!eventRow) throw new Error("Event not found");
    if ((eventRow as { host_id: string }).host_id !== hostId) {
      throw new Error("Only the host can invite people");
    }

    const rows = userIds
      .filter((id) => id !== hostId)
      .map((userId) => ({ event_id: eventId, user_id: userId }));
    if (rows.length === 0) return;

    const { error } = await client
      .from("event_invitees")
      .upsert(rows, { onConflict: "event_id,user_id" });

    if (error) fail("Could not add invitees", error);
  },

  async addOptionToEvent(eventId, placeId, userId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("id, host_id, status, kaki_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!eventRow) throw new Error("Event not found");
    const event = eventRow as Pick<
      LunchEvent,
      "id" | "host_id" | "status" | "kaki_id"
    >;
    if (event.status !== "open") throw new Error("This Jio is already closed");

    // Mirrors the RLS policy in migration 013. Duplicated on purpose: the
    // policy is the real gate, this is what produces a readable error.
    let allowed = event.host_id === userId;

    if (!allowed && event.kaki_id) {
      const { data } = await client
        .from("kaki_members")
        .select("user_id")
        .eq("kaki_id", event.kaki_id)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = Boolean(data);
    }

    if (!allowed) {
      const { data } = await client
        .from("event_invitees")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = Boolean(data);
    }

    if (!allowed) {
      throw new Error("Only the host, kaki members or invitees can add places");
    }

    const { data: place } = await client
      .from("places")
      .select("id")
      .eq("id", placeId)
      .maybeSingle();
    if (!place) throw new Error("Place not found");

    const { data: existing } = await client
      .from("event_options")
      .select("place_id")
      .eq("event_id", eventId)
      .eq("place_id", placeId)
      .maybeSingle();
    if (existing) throw new Error("That place is already an option");

    const { error } = await client
      .from("event_options")
      .insert({ event_id: eventId, place_id: placeId, added_by: userId });

    if (error) fail("Could not add that place", error);
  },

  async removeOptionFromEvent(eventId, placeId, userId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("host_id, status")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");

    const event = eventRow as { host_id: string; status: string };
    if (event.status !== "open") throw new Error("This Jio is already closed");

    const { data: optionRow } = await client
      .from("event_options")
      .select("added_by")
      .eq("event_id", eventId)
      .eq("place_id", placeId)
      .maybeSingle();
    if (!optionRow) throw new Error("That place is not an option");

    const option = optionRow as { added_by: string };
    if (event.host_id !== userId && option.added_by !== userId) {
      throw new Error("Only the host or whoever added it can remove a place");
    }

    const { error } = await client
      .from("event_options")
      .delete()
      .eq("event_id", eventId)
      .eq("place_id", placeId);
    if (error) fail("Could not remove that place", error);

    // Drop any ballot rows that pointed at the removed option, or the Borda
    // count would be scoring a place nobody can pick any more.
    await client
      .from("event_votes")
      .delete()
      .eq("event_id", eventId)
      .eq("place_id", placeId);
  },

  async castBallot(eventId, userId, rankedPlaceIds) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");
    if ((eventRow as { status: string }).status !== "open") {
      throw new Error("This Jio is already closed");
    }

    const { data: optionRows } = await client
      .from("event_options")
      .select("place_id")
      .eq("event_id", eventId);

    const optionIds = new Set(
      ((optionRows ?? []) as { place_id: string }[]).map((o) => o.place_id)
    );

    // Replace the whole ballot rather than patching it — partial updates leave
    // stale ranks behind when someone reorders their choices.
    await client
      .from("event_votes")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);

    const rows = rankedPlaceIds
      .filter((placeId) => optionIds.has(placeId))
      .map((placeId, index) => ({
        event_id: eventId,
        user_id: userId,
        place_id: placeId,
        rank: index + 1,
      }));

    if (rows.length === 0) return;

    const { error } = await client.from("event_votes").insert(rows);
    if (error) fail("Could not save your vote", error);
  },

  async rsvp(eventId, userId, response) {
    const client = await db();
    const { error } = await client
      .from("event_rsvps")
      .upsert(
        { event_id: eventId, user_id: userId, response },
        { onConflict: "event_id,user_id" }
      );

    if (error) fail("Could not save your RSVP", error);
  },

  async closeEvent(eventId, hostId, winnerPlaceId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("host_id, status")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");
    if ((eventRow as { host_id: string }).host_id !== hostId) {
      throw new Error("Only the host can close this Jio");
    }

    let winner = winnerPlaceId ?? null;

    if (!winner) {
      const [{ data: optionRows }, { data: voteRows }] = await Promise.all([
        client.from("event_options").select("place_id").eq("event_id", eventId),
        client.from("event_votes").select("*").eq("event_id", eventId),
      ]);

      const optionIds = ((optionRows ?? []) as { place_id: string }[]).map(
        (o) => o.place_id
      );
      winner = computeWinner(
        (voteRows ?? []) as EventVote[],
        optionIds
      ).winnerId;
    }

    const { error } = await client
      .from("lunch_events")
      .update({ status: "closed", winner_place_id: winner })
      .eq("id", eventId);

    if (error) fail("Could not close that Jio", error);

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while closing");
    return detail;
  },

  // ---- Wishlist ----

  async listWishlist(userId) {
    const client = await db();
    const { data, error } = await client
      .from("wishlist")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) fail("Could not load your wishlist", error);

    const entries = (data ?? []) as WishlistEntry[];
    if (entries.length === 0) return [];

    const { data: placeRows } = await client
      .from("places")
      .select("*")
      .in(
        "id",
        entries.map((e) => e.place_id)
      );

    const places = (placeRows ?? []) as Place[];
    const walks = await walkTimes(client, DEFAULT_OFFICE.id, places);
    const placeById = new Map(
      places.map((p) => {
        const walk = walks.get(p.id);
        return [
          p.id,
          {
            ...p,
            walk_minutes: walk?.walk_minutes ?? null,
            distance_m: walk?.distance_m ?? null,
          } as Place,
        ];
      })
    );

    return entries.map((e) => ({ ...e, place: placeById.get(e.place_id) }));
  },

  async toggleWishlist(userId, placeId) {
    const client = await db();

    const { data: existing } = await client
      .from("wishlist")
      .select("place_id")
      .eq("user_id", userId)
      .eq("place_id", placeId)
      .maybeSingle();

    if (existing) {
      const { error } = await client
        .from("wishlist")
        .delete()
        .eq("user_id", userId)
        .eq("place_id", placeId);
      if (error) fail("Could not update your wishlist", error);
      return { added: false };
    }

    const { error } = await client
      .from("wishlist")
      .insert({ user_id: userId, place_id: placeId });
    if (error) fail("Could not update your wishlist", error);
    return { added: true };
  },

  // ---- Recos ----

  async createReco(userId, placeId, comment) {
    const client = await db();
    const { data, error } = await client
      .from("recos")
      .upsert(
        { user_id: userId, place_id: placeId, comment: comment ?? null },
        { onConflict: "place_id,user_id" }
      )
      .select()
      .single();

    if (error) fail("Could not save that recommendation", error);
    return data as Reco;
  },

  async deleteReco(userId, placeId) {
    const client = await db();
    const { error } = await client
      .from("recos")
      .delete()
      .eq("user_id", userId)
      .eq("place_id", placeId);

    if (error) fail("Could not remove that recommendation", error);
  },

  async listRecos(limit = 20) {
    const client = await db();
    const { data, error } = await client
      .from("recos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) fail("Could not load recommendations", error);

    const recos = (data ?? []) as Reco[];
    if (recos.length === 0) return [];

    const [names, { data: placeRows }] = await Promise.all([
      displayNameMap(
        client,
        recos.map((r) => r.user_id)
      ),
      client
        .from("places")
        .select("*")
        .in(
          "id",
          Array.from(new Set(recos.map((r) => r.place_id)))
        ),
    ]);

    const places = (placeRows ?? []) as Place[];
    const walks = await walkTimes(client, DEFAULT_OFFICE.id, places);
    const placeById = new Map(
      places.map((p) => {
        const walk = walks.get(p.id);
        return [
          p.id,
          {
            ...p,
            walk_minutes: walk?.walk_minutes ?? null,
            distance_m: walk?.distance_m ?? null,
          } as Place,
        ];
      })
    );

    return recos.map((r) => ({
      ...r,
      display_name: names.get(r.user_id),
      place: placeById.get(r.place_id),
    }));
  },

  async listRecosForPlace(placeId) {
    const client = await db();
    const { data, error } = await client
      .from("recos")
      .select("*")
      .eq("place_id", placeId)
      .order("created_at", { ascending: false });

    if (error) fail("Could not load recommendations", error);

    const recos = (data ?? []) as Reco[];
    const names = await displayNameMap(
      client,
      recos.map((r) => r.user_id)
    );

    return recos.map((r) => ({ ...r, display_name: names.get(r.user_id) }));
  },

  // ---- Kakis ----

  async createKaki(userId, name) {
    const client = await db();

    const { data, error } = await client
      .from("kakis")
      .insert({
        name,
        created_by: userId,
        invite_token: generateToken(),
      })
      .select()
      .single();

    if (error) fail("Could not create that kaki group", error);
    const kaki = data as Kaki;

    const { error: memberError } = await client
      .from("kaki_members")
      .insert({ kaki_id: kaki.id, user_id: userId });
    if (memberError) fail("Could not join the group you just made", memberError);

    return { ...kaki, member_count: 1 };
  },

  async getKaki(idOrToken) {
    const client = await db();

    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrToken
      );

    let kakiRow: Kaki | null = null;

    if (looksLikeUuid) {
      const { data } = await client
        .from("kakis")
        .select("*")
        .eq("id", idOrToken)
        .maybeSingle();
      kakiRow = (data as Kaki | null) ?? null;
    }

    if (!kakiRow) {
      const { data } = await client
        .from("kakis")
        .select("*")
        .eq("invite_token", idOrToken)
        .maybeSingle();
      kakiRow = (data as Kaki | null) ?? null;
    }

    if (!kakiRow) return null;

    const { data: memberRows } = await client
      .from("kaki_members")
      .select("*")
      .eq("kaki_id", kakiRow.id);

    const memberList = (memberRows ?? []) as KakiMember[];
    const names = await displayNameMap(
      client,
      memberList.map((m) => m.user_id)
    );

    const members: KakiMember[] = memberList.map((m) => ({
      ...m,
      display_name: names.get(m.user_id),
    }));

    const detail: KakiDetail = {
      ...kakiRow,
      member_count: members.length,
      members,
    };
    return detail;
  },

  async listKakis(userId) {
    const client = await db();

    const { data: memberRows } = await client
      .from("kaki_members")
      .select("kaki_id")
      .eq("user_id", userId);

    const kakiIds = ((memberRows ?? []) as { kaki_id: string }[]).map(
      (r) => r.kaki_id
    );
    if (kakiIds.length === 0) return [];

    const [{ data: kakiRows }, { data: allMembers }] = await Promise.all([
      client.from("kakis").select("*").in("id", kakiIds),
      client.from("kaki_members").select("kaki_id").in("kaki_id", kakiIds),
    ]);

    const counts = new Map<string, number>();
    for (const row of (allMembers ?? []) as { kaki_id: string }[]) {
      counts.set(row.kaki_id, (counts.get(row.kaki_id) ?? 0) + 1);
    }

    return ((kakiRows ?? []) as Kaki[]).map((k) => ({
      ...k,
      member_count: counts.get(k.id) ?? 0,
    }));
  },

  async joinKaki(token, userId) {
    const client = await db();

    const { data: kakiRow } = await client
      .from("kakis")
      .select("*")
      .eq("invite_token", token)
      .maybeSingle();

    if (!kakiRow) throw new Error("That invite link is not valid");
    const kaki = kakiRow as Kaki;

    const { error } = await client
      .from("kaki_members")
      .upsert(
        { kaki_id: kaki.id, user_id: userId },
        { onConflict: "kaki_id,user_id" }
      );

    if (error) fail("Could not join that group", error);

    const { data: members } = await client
      .from("kaki_members")
      .select("user_id")
      .eq("kaki_id", kaki.id);

    return { ...kaki, member_count: (members ?? []).length };
  },

  async leaveKaki(kakiId, userId) {
    const client = await db();
    const { error } = await client
      .from("kaki_members")
      .delete()
      .eq("kaki_id", kakiId)
      .eq("user_id", userId);

    if (error) fail("Could not leave that group", error);
  },
};

export default supabaseRepo;
