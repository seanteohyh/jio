import { DEFAULT_OFFICE, RECURRING_LOOKAHEAD_DAYS } from "@/lib/constants";
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
import { computeWinner } from "@/lib/voting";
import { rankPlaces } from "@/lib/recommend";
import { pickCommitteeSuggestions } from "@/lib/suggestCommittee";
import { DISCOVERY_CONFIG } from "@/lib/discoveryConfig";
import { createAuthServerClient } from "@/lib/supabase/serverAuth";
import type { Repo } from "./index";
import type {
  AdminAnalytics,
  AdminEngagementWeights,
  AdminPlaceDetail,
  AdminUserDetail,
  AdminUsersData,
  CuisineMergePreview,
  CuisineOption,
  EventCandidateDate,
  EventDateVote,
  EventDetail,
  EventInvitee,
  EventOption,
  EventRsvp,
  EventVote,
  Filters,
  FoodIdentityCard,
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
  Place,
  PlaceFlag,
  PlacesPagination,
  Profile,
  PublicEventPreview,
  RecurringSeries,
  TeamUser,
  UserFoodIdentitySnapshot,
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

/**
 * `avg_rating` and `visit_count` are real, trigger-maintained columns on
 * `places` now (021_place_ratings_trigger.sql) — a plain `select("*")`
 * already returns them, so there is nothing left for this file to
 * aggregate. Kept as `place.avg_rating`/`place.visit_count` reads inline
 * below rather than a helper function, since there's no query left to share.
 */

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

/** Everyone who counts as "coming to this Jio": host, kaki members, invitees. */
async function resolveEventParticipants(
  client: SupabaseClient,
  event: { id: string; host_id: string; kaki_id?: string | null }
): Promise<string[]> {
  const ids = new Set<string>([event.host_id]);

  const [{ data: memberRows }, { data: inviteeRows }] = await Promise.all([
    event.kaki_id
      ? client.from("kaki_members").select("user_id").eq("kaki_id", event.kaki_id)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    client.from("event_invitees").select("user_id").eq("event_id", event.id),
  ]);

  for (const row of (memberRows ?? []) as { user_id: string }[]) ids.add(row.user_id);
  for (const row of (inviteeRows ?? []) as { user_id: string }[]) ids.add(row.user_id);

  return Array.from(ids);
}

/** Hydrates place flags with the place's name and the flagger's display name. */
async function hydrateFlags(
  client: SupabaseClient,
  flags: PlaceFlag[]
): Promise<PlaceFlag[]> {
  if (flags.length === 0) return [];

  const [names, { data: placeRows }] = await Promise.all([
    displayNameMap(client, flags.map((f) => f.flagged_by)),
    client
      .from("places")
      .select("id, name")
      .in("id", Array.from(new Set(flags.map((f) => f.place_id)))),
  ]);

  const placeNameById = new Map(
    ((placeRows ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );

  return flags.map((f) => ({
    ...f,
    place_name: placeNameById.get(f.place_id),
    flagged_by_name: names.get(f.flagged_by),
  }));
}

/** Attach display names, the place, and (if any) the source event's title. */
interface LobangCommon {
  placeById: Map<string, Place>;
  eventTitles: Map<string, string>;
}

async function lobangCommon(
  client: SupabaseClient,
  lobangs: Lobang[]
): Promise<LobangCommon> {
  const placeIds = Array.from(new Set(lobangs.map((l) => l.place_id)));
  const eventIds = Array.from(
    new Set(lobangs.map((l) => l.event_id).filter((id): id is string => Boolean(id)))
  );

  const [{ data: placeRows }, eventTitles] = await Promise.all([
    client.from("places").select("*").in("id", placeIds),
    eventIds.length === 0
      ? Promise.resolve(new Map<string, string>())
      : client
          .from("lunch_events")
          .select("id, title")
          .in("id", eventIds)
          .then(({ data }: { data: { id: string; title: string }[] | null }) => {
            const map = new Map<string, string>();
            for (const row of (data ?? []) as { id: string; title: string }[]) {
              map.set(row.id, row.title);
            }
            return map;
          }),
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

  return { placeById, eventTitles };
}

/** Hydrates a lobang for one specific recipient's view (their own seen_at). */
async function hydrateReceivedLobangs(
  client: SupabaseClient,
  lobangs: Lobang[],
  viewerId: string
): Promise<Lobang[]> {
  if (lobangs.length === 0) return [];

  const [{ placeById, eventTitles }, names, { data: recipientRows }] =
    await Promise.all([
      lobangCommon(client, lobangs),
      displayNameMap(client, [...lobangs.map((l) => l.from_user_id), viewerId]),
      client
        .from("lobang_recipients")
        .select("lobang_id, seen_at")
        .eq("user_id", viewerId)
        .in(
          "lobang_id",
          lobangs.map((l) => l.id)
        ),
    ]);

  const seenById = new Map(
    ((recipientRows ?? []) as { lobang_id: string; seen_at: string | null }[]).map(
      (r) => [r.lobang_id, r.seen_at]
    )
  );

  return lobangs.map((l) => ({
    ...l,
    from_display_name: names.get(l.from_user_id),
    to_user_id: viewerId,
    to_display_name: names.get(viewerId),
    seen_at: seenById.get(l.id) ?? null,
    place: placeById.get(l.place_id),
    event_title: l.event_id ? eventTitles.get(l.event_id) ?? null : null,
  }));
}

/** Hydrates a lobang as the send itself, for the sender's own history. */
async function hydrateSentLobangs(
  client: SupabaseClient,
  lobangs: Lobang[]
): Promise<Lobang[]> {
  if (lobangs.length === 0) return [];

  const lobangIds = lobangs.map((l) => l.id);
  const kakiIds = Array.from(
    new Set(lobangs.map((l) => l.kaki_id).filter((id): id is string => Boolean(id)))
  );

  const [{ placeById, eventTitles }, { data: recipientRows }, { data: kakiRows }] =
    await Promise.all([
      lobangCommon(client, lobangs),
      client
        .from("lobang_recipients")
        .select("lobang_id, user_id")
        .in("lobang_id", lobangIds),
      kakiIds.length === 0
        ? Promise.resolve({ data: [] as { id: string; name: string }[] })
        : client.from("kakis").select("id, name").in("id", kakiIds),
    ]);

  const recipientsByLobang = new Map<string, string[]>();
  for (const row of (recipientRows ?? []) as {
    lobang_id: string;
    user_id: string;
  }[]) {
    const list = recipientsByLobang.get(row.lobang_id) ?? [];
    list.push(row.user_id);
    recipientsByLobang.set(row.lobang_id, list);
  }

  const kakiNameById = new Map(
    ((kakiRows ?? []) as { id: string; name: string }[]).map((k) => [k.id, k.name])
  );

  const names = await displayNameMap(client, [
    ...lobangs.map((l) => l.from_user_id),
    ...Array.from(recipientsByLobang.values()).flat(),
  ]);

  return lobangs.map((l) => {
    const recipients = recipientsByLobang.get(l.id) ?? [];
    let toUserId: string | undefined;
    let toDisplayName: string | undefined;

    if (l.kaki_id) {
      toDisplayName = kakiNameById.get(l.kaki_id) ?? "a Kaki";
    } else if (recipients.length === 1) {
      toUserId = recipients[0];
      toDisplayName = names.get(recipients[0]);
    } else if (recipients.length > 1) {
      toDisplayName = `${recipients.length} teammates`;
    }

    return {
      ...l,
      from_display_name: names.get(l.from_user_id),
      to_user_id: toUserId,
      to_display_name: toDisplayName,
      place: placeById.get(l.place_id),
      event_title: l.event_id ? eventTitles.get(l.event_id) ?? null : null,
    };
  });
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export const supabaseRepo: Repo = {
  // ---- Places ----

  async listPlaces(filters?: Partial<Filters>, pagination?: PlacesPagination) {
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
    const walks = await walkTimes(client, officeId, places);

    let enriched = places.map((place) => {
      const walk = walks.get(place.id);
      return {
        ...place,
        walk_minutes: walk?.walk_minutes ?? null,
        distance_m: walk?.distance_m ?? null,
        avg_rating: place.avg_rating ?? null,
        visit_count: place.visit_count ?? 0,
      };
    });

    // Walk time is not a `places` column (it's per-office, in walk_cache), so
    // this filter — and the sort/pagination below — happen post-enrichment
    // in JS rather than as a SQL `ORDER BY`/`LIMIT`. Fine at pilot scale; a
    // real push-down would need a places/walk_cache join.
    if (typeof filters?.maxWalkMinutes === "number") {
      enriched = enriched.filter(
        (p) =>
          typeof p.walk_minutes !== "number" ||
          p.walk_minutes <= filters.maxWalkMinutes!
      );
    }

    const sorted = sortPlacesForList(enriched, filters?.sortBy);
    if (!pagination) return { places: sorted, total: sorted.length };

    const { limit, offset } = pagination;
    return {
      places: sorted.slice(offset, offset + limit),
      total: sorted.length,
    };
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
    const walks = await walkTimes(client, DEFAULT_OFFICE.id, [place]);
    const walk = walks.get(place.id);

    return {
      ...place,
      walk_minutes: walk?.walk_minutes ?? null,
      distance_m: walk?.distance_m ?? null,
      avg_rating: place.avg_rating ?? null,
      visit_count: place.visit_count ?? 0,
    };
  },

  async getPublicPlace(id) {
    const client = await db();
    const { data, error } = await client.rpc("get_public_place", {
      p_place_id: id,
    });

    if (error) fail("Could not load that place", error);
    const row = data?.[0];
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      address: row.address ?? null,
      cuisine: row.cuisine ?? [],
      custom_cuisine_tags: row.custom_cuisine_tags ?? [],
      budget_tier: row.budget_tier,
      best_dishes: row.best_dishes ?? [],
      avg_rating: row.avg_rating ?? null,
      visit_count: row.visit_count ?? 0,
      lat: row.lat,
      lng: row.lng,
      google_place_id: row.google_place_id ?? null,
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
    // System-computed (049_google_place_id.sql) — also excluded from the
    // grant itself, so a plain UPDATE naming this column would fail outright
    // rather than silently no-op, but stripping it here keeps a client-sent
    // value from ever reaching the query at all.
    delete (patch as Record<string, unknown>).google_place_id;

    const { data: row, error } = await client
      .from("places")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) fail("Could not update that place", error);
    return row as Place;
  },

  async setGooglePlaceId(placeId, googlePlaceId) {
    const client = await db();
    const { error } = await client.rpc("set_google_place_id", {
      p_place_id: placeId,
      p_google_place_id: googlePlaceId,
    });
    if (error) fail("Could not save that place's Google Maps listing", error);
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

  async updateVisit(id, userId, patch) {
    const client = await db();

    // Only the fields a person is allowed to amend. Spreading `patch`
    // straight in would let an "edit" reassign user_id or place_id — RLS
    // would catch the first but not the second.
    const fields: Record<string, unknown> = {};
    if (patch.rating !== undefined) fields.rating = patch.rating;
    if (patch.best_dishes !== undefined) fields.best_dishes = patch.best_dishes;
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (patch.visited_at !== undefined) fields.visited_at = patch.visited_at;
    if (patch.is_public !== undefined) fields.is_public = patch.is_public;

    const { data: row, error } = await client
      .from("visits")
      .update(fields)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    // The `visits_update` RLS policy already restricts this to your own rows;
    // the explicit user_id filter is what turns "policy refused" into a plain
    // no-rows result, which reads as a clean 404 rather than a database error.
    if (error) fail("Could not update that visit", error);
    if (!row) throw new Error("That visit is not yours to change");
    return row as Visit;
  },

  async deleteVisit(id, userId) {
    const client = await db();
    const { error } = await client
      .from("visits")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) fail("Could not delete that visit", error);
  },

  async listPublicReviews(placeId, viewerId) {
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

    let likedIds: Set<string> | null = null;
    if (viewerId && visits.length > 0) {
      const { data: likes } = await client
        .from("review_likes")
        .select("visit_id")
        .eq("user_id", viewerId)
        .in("visit_id", visits.map((v) => v.id));
      likedIds = new Set((likes ?? []).map((l) => l.visit_id as string));
    }

    return visits.map((v) => ({
      ...v,
      display_name: names.get(v.user_id),
      liked_by_me: likedIds ? likedIds.has(v.id) : undefined,
    }));
  },

  async toggleReviewLike(userId, visitId) {
    const client = await db();

    const { data: visit, error: visitError } = await client
      .from("visits")
      .select("user_id")
      .eq("id", visitId)
      .maybeSingle();
    if (visitError) fail("Could not load that review", visitError);
    if (!visit) throw new Error("That review does not exist");

    const { data: existing } = await client
      .from("review_likes")
      .select("visit_id")
      .eq("user_id", userId)
      .eq("visit_id", visitId)
      .maybeSingle();

    if (existing) {
      const { error } = await client
        .from("review_likes")
        .delete()
        .eq("user_id", userId)
        .eq("visit_id", visitId);
      if (error) fail("Could not update your like", error);
    } else {
      const { error } = await client
        .from("review_likes")
        .insert({ user_id: userId, visit_id: visitId });
      if (error) fail("Could not update your like", error);
    }

    const { data: updated, error: countError } = await client
      .from("visits")
      .select("like_count")
      .eq("id", visitId)
      .single();
    if (countError) fail("Could not load that review", countError);

    return {
      liked: !existing,
      like_count: (updated as { like_count: number }).like_count,
      visit_user_id: (visit as { user_id: string }).user_id,
    };
  },

  async claimReviewLikePushWindow(visitId, windowSeconds = 600) {
    const client = await db();
    const { data, error } = await client.rpc("claim_review_like_push_window", {
      p_visit_id: visitId,
      p_window_seconds: windowSeconds,
    });

    if (error) fail("Could not claim the like-push window", error);
    return Boolean(data);
  },

  async listReviewLikesSince(sinceIso) {
    // The weekly recap cron (the only caller) runs with no user session, so
    // there is no `auth.uid()` for review_likes_select's RLS policy to match
    // — same "no session to go through RLS with" situation as the discovery
    // cron's writes, so this reaches for the same service-role client
    // rather than a SECURITY DEFINER RPC granted to `anon` (which would
    // hand this cross-user join to anyone with the public anon key, not
    // just the cron).
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();

    const { data: likes, error } = await admin
      .from("review_likes")
      .select("visit_id, created_at")
      .gte("created_at", sinceIso);
    if (error) fail("Could not load recent likes", error);
    if (!likes || likes.length === 0) return [];

    const { data: visitRows, error: visitError } = await admin
      .from("visits")
      .select("id, user_id")
      .in("id", likes.map((l) => l.visit_id as string));
    if (visitError) fail("Could not load recent likes", visitError);

    const ownerOf = new Map(
      ((visitRows ?? []) as { id: string; user_id: string }[]).map((v) => [
        v.id,
        v.user_id,
      ])
    );

    return (likes as { visit_id: string; created_at: string }[])
      .filter((l) => ownerOf.has(l.visit_id))
      .map((l) => ({
        visit_id: l.visit_id,
        visit_user_id: ownerOf.get(l.visit_id) as string,
        created_at: l.created_at,
      }));
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

  async updateOffice(id, patch) {
    const client = await db();
    const { data: row, error } = await client
      .from("offices")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) fail("Could not update that office", error);
    return row as Office;
  },

  async deleteOffice(id) {
    const client = await db();
    const { error } = await client.from("offices").delete().eq("id", id);
    if (error) fail("Could not delete that office", error);
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
    // Explicit column list, not `select("*")` — migration 041 revokes
    // table-level SELECT on profiles (recovery_token must never be
    // client-readable), and `*` errors on any column the role lacks
    // privilege on rather than silently omitting it.
    const { data, error } = await client
      .from("profiles")
      .select(
        "user_id, display_name, created_at, onboarded_at, notify_events"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) fail("Could not load that profile", error);
    return (data as Profile | null) ?? null;
  },

  async upsertProfile(userId, displayName) {
    const client = await db();
    // Explicit column list, not bare `select()` — migration 041 revokes
    // table-level SELECT on profiles (recovery_token must never be
    // client-readable), and `select()` defaults to `*`, which errors on any
    // column the role lacks privilege on rather than silently omitting it.
    const { data, error } = await client
      .from("profiles")
      .upsert(
        { user_id: userId, display_name: displayName },
        { onConflict: "user_id" }
      )
      .select("user_id, display_name, created_at, onboarded_at, notify_events")
      .single();

    if (error) fail("Could not save your display name", error);
    return data as Profile;
  },

  async completeOnboarding(userId, displayName) {
    const client = await db();
    // Same reason as upsertProfile above for the explicit column list.
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          display_name: displayName,
          onboarded_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("user_id, display_name, created_at, onboarded_at, notify_events")
      .single();

    if (error) fail("Could not save your display name", error);
    return data as Profile;
  },

  // ---- Decided-Jio celebration (UX review log #25) ----
  // Migration 070 — one row per (user, event) rather than the one
  // account-wide flag migration 067 started with, since every decided Jio
  // now gets its own celebration rather than only the very first one.

  async hasSeenDecidedCelebration(userId, eventId) {
    const client = await db();
    const { data, error } = await client
      .from("decided_celebration_views")
      .select("user_id")
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) fail("Could not check that", error);
    return Boolean(data);
  },

  async markDecidedCelebrationShown(userId, eventId) {
    const client = await db();
    // `ignoreDuplicates` — idempotent, matching the old column's semantics:
    // only ever "has this fired for this Jio," never a timestamp worth
    // overwriting on a second call.
    const { error } = await client.from("decided_celebration_views").upsert(
      { user_id: userId, event_id: eventId },
      { onConflict: "user_id,event_id", ignoreDuplicates: true }
    );

    if (error) fail("Could not save that", error);
  },

  async getDisplayNames(userIds) {
    const client = await db();
    return displayNameMap(client, userIds);
  },

  async savePushSubscription(userId, sub) {
    const client = await db();
    const { error } = await client.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth_key: sub.authKey,
      },
      { onConflict: "endpoint" }
    );
    if (error) fail("Could not save that subscription", error);
  },

  async deletePushSubscription(endpoint) {
    const client = await db();
    // RLS (push_subscriptions_delete) already scopes this to the caller's
    // own rows — no user_id filter needed here, and none would help anyway
    // since RLS is the actual gate regardless of what the query says.
    const { error } = await client
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    if (error) fail("Could not remove that subscription", error);
  },

  async setNotifyEvents(userId, enabled) {
    const client = await db();
    const { error } = await client
      .from("profiles")
      .update({ notify_events: enabled })
      .eq("user_id", userId);
    if (error) fail("Could not update that preference", error);
  },

  async getPushTargets(userIds) {
    if (userIds.length === 0) return [];
    const client = await db();
    // SECURITY DEFINER (migration 037) — see its comment for why this has
    // to be a function rather than a plain query: both push_subscriptions
    // and profiles are owner-scoped by RLS, and this is the one legitimate
    // place the app reads someone else's.
    const { data, error } = await client.rpc("get_push_targets", {
      p_user_ids: userIds,
    });
    if (error) fail("Could not load push targets", error);
    return ((data ?? []) as {
      user_id: string;
      endpoint: string;
      p256dh: string;
      auth_key: string;
    }[]).map((row) => ({
      userId: row.user_id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      authKey: row.auth_key,
    }));
  },

  async listAllUsers(callerId, query, officeId, includeIds) {
    const client = await db();
    let builder = client
      .from("profiles")
      .select("user_id, display_name")
      .neq("user_id", callerId);

    const q = query?.trim();
    if (q) builder = builder.ilike("display_name", `%${q}%`);

    const { data, error } = await builder;
    if (error) fail("Could not load the team list", error);
    let candidates = (data ?? []) as TeamUser[];

    // Force-include anything the caller already has selected, even if it
    // doesn't match the current search text or would otherwise sit in the
    // hidden-by-default tier 3 — see the interface doc comment.
    const includeSet = new Set(includeIds ?? []);
    const toInclude = (includeIds ?? []).filter(
      (id) => id !== callerId && !candidates.some((c) => c.user_id === id)
    );
    if (toInclude.length > 0) {
      const { data: extra, error: extraError } = await client
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", toInclude);
      if (extraError) fail("Could not load the team list", extraError);
      candidates = [...candidates, ...((extra ?? []) as TeamUser[])];
    }

    if (officeId && candidates.length > 0) {
      const { data: prefsRows } = await client
        .from("user_prefs")
        .select("user_id, default_office_id")
        .in(
          "user_id",
          candidates.map((u) => u.user_id)
        );
      const officeByUser = new Map(
        (
          (prefsRows ?? []) as {
            user_id: string;
            default_office_id: string | null;
          }[]
        ).map((p) => [p.user_id, p.default_office_id])
      );
      // Force-included ids stay exempt from office scoping — they're
      // already-selected, not a fresh discovery result.
      candidates = candidates.filter(
        (u) =>
          includeSet.has(u.user_id) ||
          (officeByUser.get(u.user_id) ?? DEFAULT_OFFICE.id) === officeId
      );
    }

    // §4.2's three tiers — see 054_co_attendance.sql for why tier 1 needs
    // its own SECURITY DEFINER function rather than a plain query.
    const { data: scoreRows, error: scoreError } = await client.rpc(
      "get_co_attendance_scores",
      {
        p_user_id: callerId,
        p_half_life_days: DISCOVERY_CONFIG.coAttendance.halfLifeDays,
      }
    );
    if (scoreError) fail("Could not rank teammates", scoreError);
    const scores = new Map(
      ((scoreRows ?? []) as { user_id: string; score: number }[]).map((r) => [
        r.user_id,
        Number(r.score),
      ])
    );

    const { data: myKakiRows } = await client
      .from("kaki_members")
      .select("kaki_id")
      .eq("user_id", callerId);
    const callerKakiIds = new Set(
      ((myKakiRows ?? []) as { kaki_id: string }[]).map((r) => r.kaki_id)
    );

    const tier2KakiName = new Map<string, string>();
    if (callerKakiIds.size > 0) {
      const { data: kakiRows } = await client
        .from("kakis")
        .select("id, name")
        .in("id", Array.from(callerKakiIds));
      const kakiNames = new Map(
        ((kakiRows ?? []) as { id: string; name: string }[]).map((k) => [
          k.id,
          k.name,
        ])
      );

      const { data: coMemberRows } = await client
        .from("kaki_members")
        .select("kaki_id, user_id")
        .in("kaki_id", Array.from(callerKakiIds))
        .neq("user_id", callerId);
      for (const m of (coMemberRows ?? []) as {
        kaki_id: string;
        user_id: string;
      }[]) {
        if ((scores.get(m.user_id) ?? 0) > 0) continue;
        const name = kakiNames.get(m.kaki_id);
        if (!name) continue;
        const existing = tier2KakiName.get(m.user_id);
        if (!existing || name.localeCompare(existing) < 0) {
          tier2KakiName.set(m.user_id, name);
        }
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
        hide_votes: hideVotes ?? false,
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

    const client = await db();
    const earliest = [...uniqueDates].sort()[0];
    // A bare "YYYY-MM-DD" always parses as UTC midnight — 8am once
    // formatted in Singapore time. An explicit +08:00 offset on a real
    // (host-chosen, or noon-default) time avoids that entirely.
    const scheduledAt = new Date(
      `${earliest}T${timeOfDay || "12:00"}+08:00`
    ).toISOString();

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
        date_phase: "polling",
        hide_votes: hideVotes ?? false,
      })
      .select()
      .single();

    if (error) fail("Could not create that Flexi Jio", error);
    const event = eventRow as LunchEvent;

    const { error: dateError } = await client.from("event_candidate_dates").insert(
      uniqueDates.map((date) => ({
        event_id: event.id,
        date,
        added_by: hostId,
      }))
    );
    if (dateError) fail("Could not add the candidate dates", dateError);

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

    const [optionsRes, votesRes, rsvpsRes, inviteesRes, candidateDatesRes, dateVotesRes] =
      await Promise.all([
        client.from("event_options").select("*").eq("event_id", event.id),
        client.from("event_votes").select("*").eq("event_id", event.id),
        client.from("event_rsvps").select("*").eq("event_id", event.id),
        client.from("event_invitees").select("*").eq("event_id", event.id),
        client.from("event_candidate_dates").select("*").eq("event_id", event.id),
        client.from("event_date_votes").select("*").eq("event_id", event.id),
      ]);

    const optionRows = (optionsRes.data ?? []) as EventOption[];
    const votes = (votesRes.data ?? []) as EventVote[];
    const rsvpRows = (rsvpsRes.data ?? []) as EventRsvp[];
    const inviteeRows = (inviteesRes.data ?? []) as EventInvitee[];
    const candidateDateRows = (candidateDatesRes.data ?? []) as EventCandidateDate[];
    const dateVoteRows = (dateVotesRes.data ?? []) as EventDateVote[];

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
      ...candidateDateRows.map((d) => d.added_by),
      ...dateVoteRows.map((v) => v.user_id),
    ]);

    const candidateDates: EventCandidateDate[] = candidateDateRows
      .map((d) => ({ ...d, added_by_name: names.get(d.added_by) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dateVotes: EventDateVote[] = dateVoteRows.map((v) => ({
      ...v,
      display_name: names.get(v.user_id),
    }));

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
      winner_place: winnerId ? placeById.get(winnerId) ?? null : null,
      winner_label:
        winnerId && !placeById.get(winnerId)
          ? (optionRows.find((o) => o.place_id === winnerId)?.label ?? null)
          : null,
      options,
      votes,
      rsvps,
      invitees,
      candidateDates,
      dateVotes,
      tally,
    };

    return detail;
  },

  async getPublicEventPreview(token) {
    const client = await db();
    const { data, error } = await client.rpc("get_public_event_preview", {
      p_token: token,
    });
    if (error) fail("Could not load that Jio", error);
    return (data ?? null) as PublicEventPreview | null;
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
    const [optionCountRes, rsvpCountRes, dateVoteRes, namesMap] = await Promise.all([
      client.from("event_options").select("event_id").in("event_id", eventIds),
      client
        .from("event_rsvps")
        .select("event_id, response")
        .in("event_id", eventIds),
      client
        .from("event_date_votes")
        .select("event_id")
        .eq("user_id", userId)
        .in("event_id", eventIds),
      displayNameMap(
        client,
        events.map((e) => e.host_id)
      ),
    ]);

    const markedAvailability = new Set(
      ((dateVoteRes.data ?? []) as { event_id: string }[]).map((r) => r.event_id)
    );

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

    // Winners with no places row are a free-text option that won outright
    // ("vote first, prompt after" — CHANGES_20260801.md §8). Their label
    // lives on event_options, keyed by the same id.
    const winnerIdsWithoutPlace = winnerIds.filter((id) => !winnerNames.has(id));
    const winnerLabels = new Map<string, string>();
    if (winnerIdsWithoutPlace.length > 0) {
      const { data } = await client
        .from("event_options")
        .select("place_id, label")
        .in("place_id", winnerIdsWithoutPlace);
      for (const row of (data ?? []) as {
        place_id: string;
        label: string | null;
      }[]) {
        if (row.label) winnerLabels.set(row.place_id, row.label);
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
        winner_label: e.winner_place_id
          ? winnerLabels.get(e.winner_place_id) ?? null
          : null,
        has_marked_availability: markedAvailability.has(e.id),
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

  // Host-privileged and cross-table (invitee row, plus their RSVP, ballot
  // and any Flexi date-availability) — routed through a security-definer
  // RPC rather than plain client deletes, since event_rsvps/event_votes/
  // event_date_votes are all `user_id = auth.uid()`-only under RLS and a
  // host's own session has no standing to delete another user's rows on
  // them directly. See 055_remove_event_invitee.sql.
  async removeInviteeFromEvent(eventId, userId, _hostId) {
    const client = await db();
    const { error } = await client.rpc("remove_event_invitee", {
      p_event_id: eventId,
      p_user_id: userId,
    });
    if (error) fail("Could not remove that invitee", error);
  },

  // `userId` isn't passed to the RPC — same shape as cancelEvent's
  // `_hostId`. join_event_via_invite trusts auth.uid(), not an argument the
  // caller could otherwise forge; kept in the signature only so this
  // matches demoRepo's arity (see tests/repoConformance.test.ts).
  async joinEventViaInvite(eventId, _userId) {
    const client = await db();
    // SECURITY DEFINER (migration 036) — event_invitees_insert's RLS policy
    // is host-only by design, so a visitor registering themselves has to go
    // through a function scoped to auth.uid(), same shape as
    // attach_place_to_option or cancel_event.
    const { error } = await client.rpc("join_event_via_invite", {
      p_event_id: eventId,
    });
    if (error) fail("Could not join that Jio", error);
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

  async addFreeTextOptionToEvent(eventId, label, userId) {
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

    // Same authorization as addOptionToEvent, mirrored on purpose.
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

    const trimmed = label.trim();
    if (!trimmed) throw new Error("Give it a name");

    // See the `place_id` doc comment on EventOption: this id is generated,
    // not looked up, and never matches a real place — that's what makes it
    // votable through the same event_votes.place_id column real places use.
    // No string prefix: event_options.place_id is still a uuid column (see
    // migration 032), just no longer FK'd to `places`.
    const placeId = uuid();

    const { error } = await client.from("event_options").insert({
      event_id: eventId,
      place_id: placeId,
      added_by: userId,
      label: trimmed,
    });
    if (error) fail("Could not add that option", error);

    return {
      event_id: eventId,
      place_id: placeId,
      added_by: userId,
      is_suggested: false,
      label: trimmed,
    };
  },

  // `userId` isn't needed here — attach_place_to_option checks auth.uid()
  // against the option's added_by / the event's host_id itself, same as
  // block_place does for `status`. Passing it through would just be a
  // second, redundant claim the RPC would have to trust or ignore.
  async attachPlaceToOption(eventId, oldPlaceId, newPlaceId, _userId) {
    const client = await db();
    const { error } = await client.rpc("attach_place_to_option", {
      p_event_id: eventId,
      p_old_place_id: oldPlaceId,
      p_new_place_id: newPlaceId,
    });
    if (error) fail("Could not attach that place", error);
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

  async suggestOptionsForEvent(eventId, userId, excludePlaceIds = []) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("id, host_id, status, kaki_id, office_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");

    const event = eventRow as Pick<
      LunchEvent,
      "id" | "host_id" | "status" | "kaki_id" | "office_id"
    >;
    if (event.status !== "open") throw new Error("This Jio is already closed");

    const participantIds = await resolveEventParticipants(client, event);
    if (!participantIds.includes(userId)) {
      throw new Error("Only the host, kaki members or invitees can add places");
    }

    const [{ data: optionRows }, { data: voteRows }, { data: rsvpRows }] =
      await Promise.all([
        client.from("event_options").select("place_id, is_suggested").eq("event_id", eventId),
        client.from("event_votes").select("place_id").eq("event_id", eventId),
        client.from("event_rsvps").select("user_id, response").eq("event_id", eventId),
      ]);

    // A re-roll replaces any earlier suggestion nobody's voted on yet;
    // anything that already has a vote stays untouched.
    const votedPlaceIds = new Set(
      ((voteRows ?? []) as { place_id: string }[]).map((v) => v.place_id)
    );
    const options = (optionRows ?? []) as { place_id: string; is_suggested: boolean }[];
    const staleSuggestedIds = options
      .filter((o) => o.is_suggested && !votedPlaceIds.has(o.place_id))
      .map((o) => o.place_id);

    if (staleSuggestedIds.length > 0) {
      const { error: cleanupError } = await client
        .from("event_options")
        .delete()
        .eq("event_id", eventId)
        .in("place_id", staleSuggestedIds);
      if (cleanupError) fail("Could not clear the earlier suggestions", cleanupError);
    }

    const currentOptionIds = new Set(
      options
        .map((o) => o.place_id)
        .filter((id) => !staleSuggestedIds.includes(id))
    );

    const respondedYesOrMaybe = new Set(
      ((rsvpRows ?? []) as { user_id: string; response: string }[])
        .filter(
          (r) =>
            participantIds.includes(r.user_id) &&
            (r.response === "yes" || r.response === "maybe")
        )
        .map((r) => r.user_id)
    );
    const scopedIds =
      respondedYesOrMaybe.size > 0
        ? Array.from(respondedYesOrMaybe)
        : participantIds;

    const membersData: MemberData[] = await Promise.all(
      scopedIds.map(async (uid) => {
        const [{ data: visitRows }, { data: prefsRow }, { data: wishlistRows }] =
          await Promise.all([
            client.from("visits").select("*").eq("user_id", uid),
            client.from("user_prefs").select("*").eq("user_id", uid).maybeSingle(),
            client.from("wishlist").select("place_id").eq("user_id", uid),
          ]);
        return {
          userId: uid,
          visits: (visitRows ?? []) as Visit[],
          prefs: (prefsRow as UserPrefs | null) ?? null,
          wishlistPlaceIds: ((wishlistRows ?? []) as { place_id: string }[]).map(
            (w) => w.place_id
          ),
        };
      })
    );

    const { data: placeRows } = await client
      .from("places")
      .select("*")
      .eq("status", "active");
    const places = (placeRows ?? []) as Place[];
    const walks = await walkTimes(client, event.office_id, places);
    const enrichedPlaces = places.map((p) => {
      const walk = walks.get(p.id);
      return {
        ...p,
        walk_minutes: walk?.walk_minutes ?? null,
        distance_m: walk?.distance_m ?? null,
      };
    });

    const exclude = new Set([...currentOptionIds, ...excludePlaceIds]);
    const picks = pickCommitteeSuggestions(enrichedPlaces, membersData, exclude);
    if (picks.length === 0) return [];

    const { data: inserted, error } = await client
      .from("event_options")
      .insert(
        picks.map((pick) => ({
          event_id: eventId,
          place_id: pick.place.id,
          added_by: userId,
          is_suggested: true,
        }))
      )
      .select();
    if (error) fail("Could not add suggested places", error);

    const names = await displayNameMap(client, [userId]);
    return ((inserted ?? []) as EventOption[]).map((o) => ({
      ...o,
      place: picks.find((p) => p.place.id === o.place_id)?.place,
      added_by_name: names.get(userId),
    }));
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

  async addCandidateDate(eventId, date, userId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("id, host_id, status, kaki_id, date_phase")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");

    const event = eventRow as Pick<
      LunchEvent,
      "id" | "host_id" | "status" | "kaki_id" | "date_phase"
    >;
    if (event.status !== "open") throw new Error("This Jio is already closed");
    if (event.date_phase !== "polling") {
      throw new Error("This Jio's date is already confirmed");
    }

    const participantIds = await resolveEventParticipants(client, event);
    if (!participantIds.includes(userId)) {
      throw new Error("Only the host, kaki members or invitees can add dates");
    }

    const { data: existing } = await client
      .from("event_candidate_dates")
      .select("date")
      .eq("event_id", eventId)
      .eq("date", date)
      .maybeSingle();
    if (existing) throw new Error("That date is already a candidate");

    const { error } = await client
      .from("event_candidate_dates")
      .insert({ event_id: eventId, date, added_by: userId });
    if (error) fail("Could not add that date", error);
  },

  async markDateAvailability(eventId, userId, dates) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("date_phase")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");
    if ((eventRow as { date_phase: string | null }).date_phase !== "polling") {
      throw new Error("This Jio's date is already confirmed");
    }

    const { data: candidateRows } = await client
      .from("event_candidate_dates")
      .select("date")
      .eq("event_id", eventId);
    const validDates = new Set(
      ((candidateRows ?? []) as { date: string }[]).map((d) => d.date)
    );

    // Marking availability fully replaces the prior selection.
    const { error: deleteError } = await client
      .from("event_date_votes")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);
    if (deleteError) fail("Could not update your availability", deleteError);

    const toInsert = dates.filter((d) => validDates.has(d));
    if (toInsert.length === 0) return;

    const { error: insertError } = await client
      .from("event_date_votes")
      .insert(toInsert.map((date) => ({ event_id: eventId, user_id: userId, date })));
    if (insertError) fail("Could not save your availability", insertError);
  },

  async confirmEventDate(eventId, hostId, date) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("host_id, date_phase, scheduled_at")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");

    const event = eventRow as {
      host_id: string;
      date_phase: string | null;
      scheduled_at: string;
    };
    if (event.host_id !== hostId) {
      throw new Error("Only the host can confirm the date");
    }
    if (event.date_phase !== "polling") {
      throw new Error("This Jio's date is already confirmed");
    }

    const { data: candidateRow } = await client
      .from("event_candidate_dates")
      .select("date")
      .eq("event_id", eventId)
      .eq("date", date)
      .maybeSingle();
    if (!candidateRow) throw new Error("That date was never a candidate");

    // Carries the time-of-day the host originally set at creation onto
    // whichever candidate date actually gets confirmed — same explicit
    // +08:00 offset construction as createFlexiEvent, not a bare date
    // string (which parses as UTC midnight, 8am once shown in SGT).
    const timeOfDay = sgtTimeOfDay(event.scheduled_at);
    const scheduledAt = new Date(`${date}T${timeOfDay}+08:00`).toISOString();

    const { data, error } = await client
      .from("lunch_events")
      .update({ scheduled_at: scheduledAt, date_phase: "confirmed" })
      .eq("id", eventId)
      .select()
      .single();
    if (error) fail("Could not confirm that date", error);

    return data as LunchEvent;
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
      .update({
        status: "closed",
        winner_place_id: winner,
        closed_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (error) fail("Could not close that Jio", error);

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while closing");
    return detail;
  },

  async claimVotePushWindow(eventId, windowSeconds = 600) {
    const client = await db();
    const { data, error } = await client.rpc("claim_vote_push_window", {
      p_event_id: eventId,
      p_window_seconds: windowSeconds,
    });
    if (error) fail("Could not check the vote push window", error);
    return Boolean(data);
  },

  async remindDueEvents(userId) {
    const REMINDER_WINDOW_MS = 30 * 60 * 1000;
    const now = Date.now();

    const events = await supabaseRepo.listEvents(userId);
    const due = events.filter((e) => {
      if (e.status !== "open" || e.date_phase === "polling") return false;
      if (e.reminder_sent_at) return false;
      const msAway = new Date(e.scheduled_at).getTime() - now;
      return msAway > 0 && msAway <= REMINDER_WINDOW_MS;
    });
    if (due.length === 0) return [];

    const client = await db();
    const results: Array<{ eventId: string; title: string; recipientIds: string[] }> = [];

    for (const event of due) {
      const { data: claimed, error } = await client.rpc("claim_event_reminder", {
        p_event_id: event.id,
      });
      if (error) fail("Could not check the reminder window", error);
      if (!claimed) continue;

      const [participantIds, { data: voteRows }, { data: rsvpRows }] =
        await Promise.all([
          resolveEventParticipants(client, event),
          client.from("event_votes").select("user_id").eq("event_id", event.id),
          client.from("event_rsvps").select("user_id").eq("event_id", event.id),
        ]);

      const responded = new Set<string>([
        ...((voteRows ?? []) as { user_id: string }[]).map((r) => r.user_id),
        ...((rsvpRows ?? []) as { user_id: string }[]).map((r) => r.user_id),
      ]);

      const recipientIds = participantIds.filter((id) => !responded.has(id));
      if (recipientIds.length > 0) {
        results.push({ eventId: event.id, title: event.title, recipientIds });
      }
    }

    return results;
  },

  async getEventReminderOverride(eventId, userId) {
    const client = await db();
    const { data, error } = await client
      .from("event_reminder_state")
      .select("lead_minutes")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail("Could not load your reminder setting", error);
    return (data as { lead_minutes: number | null } | null)?.lead_minutes ?? null;
  },

  async setEventReminderOverride(eventId, userId, leadMinutes) {
    const client = await db();
    const { error } = await client
      .from("event_reminder_state")
      .upsert(
        { event_id: eventId, user_id: userId, lead_minutes: leadMinutes },
        { onConflict: "event_id,user_id" }
      );
    if (error) fail("Could not save your reminder setting", error);
  },

  /**
   * The scheduled scan (see the interface doc comment in `index.ts`). Runs
   * with no user session — the external scheduler hits this with only a
   * bearer token, not a signed-in cookie — so this reaches for the
   * service-role client rather than a SECURITY DEFINER RPC granted to
   * `anon`, same reasoning as `listReviewLikesSince`: granting `anon`
   * execute on a function that reads who's confirmed going to what, across
   * every user, would hand that cross-user join to anyone holding the
   * public anon key, not just this cron.
   */
  async listAndClaimDueReminders() {
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();

    const nowIso = new Date().toISOString();
    const { data: eventRows, error: eventError } = await admin
      .from("lunch_events")
      .select("id, title, scheduled_at")
      .neq("status", "cancelled")
      .gt("scheduled_at", nowIso);
    if (eventError) fail("Could not scan for due reminders", eventError);

    const events = (eventRows ?? []) as {
      id: string;
      title: string;
      scheduled_at: string;
    }[];
    if (events.length === 0) return [];

    const eventIds = events.map((e) => e.id);
    const eventById = new Map(events.map((e) => [e.id, e]));

    const [
      { data: rsvpRows, error: rsvpError },
      { data: stateRows, error: stateError },
    ] = await Promise.all([
      admin
        .from("event_rsvps")
        .select("event_id, user_id")
        .eq("response", "yes")
        .in("event_id", eventIds),
      admin
        .from("event_reminder_state")
        .select("event_id, user_id, lead_minutes, sent_at")
        .in("event_id", eventIds),
    ]);
    if (rsvpError) fail("Could not scan for due reminders", rsvpError);
    if (stateError) fail("Could not scan for due reminders", stateError);

    const rsvps = (rsvpRows ?? []) as { event_id: string; user_id: string }[];
    if (rsvps.length === 0) return [];

    const stateByKey = new Map(
      (
        (stateRows ?? []) as {
          event_id: string;
          user_id: string;
          lead_minutes: number | null;
          sent_at: string | null;
        }[]
      ).map((r) => [`${r.event_id}:${r.user_id}`, r])
    );

    const userIds = [...new Set(rsvps.map((r) => r.user_id))];
    const { data: prefRows, error: prefError } = await admin
      .from("user_prefs")
      .select("user_id, reminders_enabled, reminder_lead_minutes")
      .in("user_id", userIds);
    if (prefError) fail("Could not scan for due reminders", prefError);

    const prefsByUser = new Map(
      (
        (prefRows ?? []) as {
          user_id: string;
          reminders_enabled: boolean;
          reminder_lead_minutes: number;
        }[]
      ).map((p) => [p.user_id, p])
    );

    const now = Date.now();
    const results: Array<{
      eventId: string;
      userId: string;
      title: string;
      scheduledAt: string;
    }> = [];

    for (const { event_id: eventId, user_id: userId } of rsvps) {
      const state = stateByKey.get(`${eventId}:${userId}`);
      if (state?.sent_at) continue; // already fired

      const prefs = prefsByUser.get(userId);
      // A missing user_prefs row means nobody has ever touched their
      // preferences — the column defaults (enabled, 30 min) are the
      // intended behaviour, so this isn't skipped just for lacking a row.
      const remindersEnabled = prefs?.reminders_enabled ?? true;
      if (!remindersEnabled) continue;

      const leadMinutes =
        state?.lead_minutes ?? prefs?.reminder_lead_minutes ?? 30;
      const event = eventById.get(eventId);
      if (!event) continue;

      const dueAt =
        new Date(event.scheduled_at).getTime() - leadMinutes * 60_000;
      if (dueAt > now) continue; // not due yet

      // Ensure a row exists (no-op if one already does), then atomically
      // claim it — a single conditional UPDATE, immune to a concurrent
      // scan run claiming the same row first.
      await admin
        .from("event_reminder_state")
        .upsert(
          { event_id: eventId, user_id: userId },
          { onConflict: "event_id,user_id", ignoreDuplicates: true }
        );

      const { data: claimedRows, error: claimError } = await admin
        .from("event_reminder_state")
        .update({ sent_at: new Date().toISOString() })
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .is("sent_at", null)
        .select();
      if (claimError) fail("Could not claim a due reminder", claimError);
      if (!claimedRows || claimedRows.length === 0) continue; // lost the race

      results.push({
        eventId,
        userId,
        title: event.title,
        scheduledAt: event.scheduled_at,
      });
    }

    return results;
  },

  // `hostId` isn't passed to the RPC — cancel_event checks auth.uid()
  // against host_id itself, same reasoning as attach_place_to_option.
  async cancelEvent(eventId, _hostId) {
    const client = await db();
    const { error } = await client.rpc("cancel_event", {
      p_event_id: eventId,
    });
    if (error) fail("Could not cancel that Jio", error);

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while cancelling");
    return detail;
  },

  async rescheduleEvent(eventId, hostId, newScheduledAt) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("status, date_phase")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");
    const event = eventRow as { status: string; date_phase: string | null };
    if (event.status === "cancelled") {
      throw new Error("A cancelled Jio has nothing to reschedule");
    }

    const updates: { scheduled_at: string; date_phase?: string } = {
      scheduled_at: newScheduledAt,
    };
    // Typing a date/time directly finalizes a still-polling Flexi Jio the
    // same way confirming a candidate does — just not restricted to the
    // pre-listed candidates.
    if (event.date_phase === "polling") updates.date_phase = "confirmed";

    const { error, count } = await client
      .from("lunch_events")
      .update(updates)
      .eq("id", eventId)
      .eq("host_id", hostId);
    if (error) fail("Could not change the date", error);
    if (count === 0) throw new Error("Only the host can change the date");

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while rescheduling");
    return detail;
  },

  async editEventWinner(eventId, hostId, newPlaceId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");
    if ((eventRow as { status: string }).status !== "closed") {
      throw new Error("Only a closed Jio's result can be corrected");
    }

    const { data: placeRow } = await client
      .from("places")
      .select("id")
      .eq("id", newPlaceId)
      .maybeSingle();
    if (!placeRow) throw new Error("That place does not exist");

    const { error, count } = await client
      .from("lunch_events")
      .update({ winner_place_id: newPlaceId })
      .eq("id", eventId)
      .eq("host_id", hostId);
    if (error) fail("Could not correct where this Jio went", error);
    if (count === 0) {
      throw new Error("Only the host can correct where this Jio went");
    }

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while correcting it");
    return detail;
  },

  async setHideVotes(eventId, hostId, hideVotes) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) throw new Error("Event not found");
    if ((eventRow as { status: string }).status !== "open") {
      throw new Error("There's nothing to hide or reveal once this Jio isn't open");
    }

    const { error, count } = await client
      .from("lunch_events")
      .update({ hide_votes: hideVotes })
      .eq("id", eventId)
      .eq("host_id", hostId);
    if (error) fail("Could not change whether the votes are hidden", error);
    if (count === 0) {
      throw new Error("Only the host can change whether the votes are hidden");
    }

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while changing hide_votes");
    return detail;
  },

  async reopenEvent(eventId, _hostId) {
    const client = await db();
    const { error } = await client.rpc("reopen_event", {
      p_event_id: eventId,
    });
    if (error) fail("Could not reopen that Jio for voting", error);

    const detail = await supabaseRepo.getEvent(eventId);
    if (!detail) throw new Error("Event vanished while reopening it");
    return detail;
  },

  /**
   * See the interface doc comment. Reads go through the normal client —
   * `event_rsvps`/`event_votes`/`lunch_events` are all broadly readable
   * (007_rls.sql), so there's no permission gap on the check itself. The
   * write is the exception: whoever's RSVP or vote just made this true
   * often isn't the host, and `lunch_events_update` only allows
   * `host_id = auth.uid()` — the same "not necessarily the host's own
   * request" problem `reopen_event`/`cancel_event` solved with a SQL
   * function. This reuses the service-role client instead, since closing
   * needs `computeWinner` (Borda counting, TypeScript) rather than
   * reimplementing it in plpgsql — the README's documented escape hatch
   * for exactly this "act outside one user's RLS scope" situation, same
   * as the cron routes and `listReviewLikesSince` already do.
   */
  async maybeAutoCloseEvent(eventId) {
    const client = await db();

    const { data: eventRow } = await client
      .from("lunch_events")
      .select("host_id, kaki_id, status, date_phase")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) return null;
    const event = eventRow as {
      host_id: string;
      kaki_id: string | null;
      status: string;
      date_phase: string | null;
    };

    if (event.status !== "open") return null;
    if (event.date_phase === "polling") return null;

    const [participants, { data: rsvpRows }, { data: voteRows }, { data: optionRows }] =
      await Promise.all([
        resolveEventParticipants(client, {
          id: eventId,
          host_id: event.host_id,
          kaki_id: event.kaki_id,
        }),
        client.from("event_rsvps").select("user_id, response").eq("event_id", eventId),
        client.from("event_votes").select("*").eq("event_id", eventId),
        client.from("event_options").select("place_id").eq("event_id", eventId),
      ]);

    const rsvpByUser = new Map(
      ((rsvpRows ?? []) as { user_id: string; response: string }[]).map(
        (r) => [r.user_id, r.response]
      )
    );

    for (const userId of participants) {
      const response = rsvpByUser.get(userId);
      if (response !== "yes" && response !== "no") return null;
    }

    const votes = (voteRows ?? []) as EventVote[];
    const votedUserIds = new Set(votes.map((v) => v.user_id));
    for (const userId of participants) {
      if (rsvpByUser.get(userId) === "yes" && !votedUserIds.has(userId)) {
        return null;
      }
    }

    const optionIds = ((optionRows ?? []) as { place_id: string }[]).map(
      (o) => o.place_id
    );
    const winner = computeWinner(votes, optionIds).winnerId;

    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("lunch_events")
      .update({
        status: "closed",
        winner_place_id: winner,
        closed_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("status", "open"); // Guards a race with a manual close/cancel in flight.

    if (error) fail("Could not auto-close that Jio", error);

    return supabaseRepo.getEvent(eventId);
  },

  // ---- Recurring series ----

  async createRecurringSeries(data) {
    const client = await db();
    const { data: row, error } = await client
      .from("recurring_series")
      .insert({
        host_id: data.host_id,
        title: data.title,
        office_id: data.office_id ?? null,
        kaki_id: data.kaki_id ?? null,
        invitee_ids: data.invitee_ids,
        weekday: data.weekday,
        time_of_day: data.time_of_day,
        mode: data.mode,
        fixed_place_id: data.fixed_place_id ?? null,
        option_place_ids: data.option_place_ids,
      })
      .select()
      .single();

    if (error) fail("Could not create that series", error);
    return row as RecurringSeries;
  },

  async listRecurringSeries(hostId) {
    const client = await db();
    const { data, error } = await client
      .from("recurring_series")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false });

    if (error) fail("Could not load your recurring Jios", error);
    const series = (data ?? []) as RecurringSeries[];
    if (series.length === 0) return [];

    const placeIds = series
      .map((s) => s.fixed_place_id)
      .filter((id): id is string => Boolean(id));
    const placeNames = new Map<string, string>();
    if (placeIds.length > 0) {
      const { data: places } = await client
        .from("places")
        .select("id, name")
        .in("id", placeIds);
      for (const p of (places ?? []) as { id: string; name: string }[]) {
        placeNames.set(p.id, p.name);
      }
    }

    return series.map((s) => ({
      ...s,
      fixed_place_name: s.fixed_place_id
        ? (placeNames.get(s.fixed_place_id) ?? null)
        : null,
    }));
  },

  async cancelRecurringSeries(seriesId, hostId) {
    const client = await db();
    const { error, count } = await client
      .from("recurring_series")
      .update({ status: "cancelled" })
      .eq("id", seriesId)
      .eq("host_id", hostId);

    if (error) fail("Could not cancel that series", error);
    // RLS silently returns zero rows for a mismatched host rather than
    // erroring, same shape as everywhere else that relies on `using` — this
    // turns that into the readable error the client actually needs.
    if (count === 0) {
      throw new Error("Only the host can cancel this series");
    }
  },

  async updateRecurringSeries(seriesId, hostId, updates) {
    const client = await db();

    const { data: existingRow } = await client
      .from("recurring_series")
      .select("*")
      .eq("id", seriesId)
      .maybeSingle();
    if (!existingRow) throw new Error("Series not found");
    const existing = existingRow as RecurringSeries;
    if (existing.host_id !== hostId) {
      throw new Error("Only the host can edit this series");
    }

    const nextMode = updates.mode ?? existing.mode;
    const payload = {
      title: updates.title ?? existing.title,
      weekday: updates.weekday ?? existing.weekday,
      time_of_day: updates.time_of_day ?? existing.time_of_day,
      mode: nextMode,
      fixed_place_id:
        nextMode === "fixed"
          ? (updates.fixed_place_id ?? existing.fixed_place_id)
          : null,
      option_place_ids:
        nextMode === "vote"
          ? (updates.option_place_ids ?? existing.option_place_ids)
          : [],
      invitee_ids: updates.invitee_ids ?? existing.invitee_ids,
      kaki_id:
        updates.kaki_id !== undefined ? updates.kaki_id : existing.kaki_id,
    };

    const { error: updateError } = await client
      .from("recurring_series")
      .update(payload)
      .eq("id", seriesId)
      .eq("host_id", hostId);
    if (updateError) fail("Could not update that series", updateError);

    const series: RecurringSeries = { ...existing, ...payload };

    // Propagate onto any already-generated occurrence that's still `open`
    // — "any Jio not confirmed yet, if pending, should also change."
    const { data: openRows } = await client
      .from("lunch_events")
      .select("id, scheduled_at")
      .eq("recurring_series_id", seriesId)
      .eq("status", "open");

    for (const occurrence of (openRows ?? []) as {
      id: string;
      scheduled_at: string;
    }[]) {
      // Time-of-day always propagates; the weekday never moves an
      // occurrence that's already generated — its calendar date is fixed.
      if (updates.time_of_day !== undefined) {
        const existingDateKey = dateKey(new Date(occurrence.scheduled_at));
        const newScheduledAt = new Date(
          `${existingDateKey}T${series.time_of_day}+08:00`
        ).toISOString();
        await client
          .from("lunch_events")
          .update({ scheduled_at: newScheduledAt })
          .eq("id", occurrence.id);
      }

      const [{ count: voteCount }, { count: rsvpCount }] = await Promise.all([
        client
          .from("event_votes")
          .select("*", { count: "exact", head: true })
          .eq("event_id", occurrence.id),
        client
          .from("event_rsvps")
          .select("*", { count: "exact", head: true })
          .eq("event_id", occurrence.id),
      ]);
      // Once someone's actually answered, changing the place/mode/invitees
      // out from under them would invalidate what they answered — leave
      // this occurrence's own options/invitees exactly as they are.
      if ((voteCount ?? 0) > 0 || (rsvpCount ?? 0) > 0) continue;

      const inviteeSet = new Set(series.invitee_ids);
      if (series.kaki_id) {
        const { data: members } = await client
          .from("kaki_members")
          .select("user_id")
          .eq("kaki_id", series.kaki_id);
        for (const m of (members ?? []) as { user_id: string }[]) {
          inviteeSet.add(m.user_id);
        }
      }
      inviteeSet.delete(series.host_id);

      await client
        .from("event_invitees")
        .delete()
        .eq("event_id", occurrence.id);
      if (inviteeSet.size > 0) {
        await client.from("event_invitees").insert(
          [...inviteeSet].map((userId) => ({
            event_id: occurrence.id,
            user_id: userId,
          }))
        );
      }
      await client
        .from("lunch_events")
        .update({ kaki_id: series.kaki_id ?? null })
        .eq("id", occurrence.id);

      await client
        .from("event_options")
        .delete()
        .eq("event_id", occurrence.id);
      const placeIds =
        series.mode === "fixed"
          ? [series.fixed_place_id!]
          : series.option_place_ids;
      await client.from("event_options").insert(
        placeIds.map((placeId) => ({
          event_id: occurrence.id,
          place_id: placeId,
          added_by: hostId,
        }))
      );
    }

    return series;
  },

  async generateDueOccurrences(hostId) {
    const client = await db();
    const { data: seriesRows, error } = await client
      .from("recurring_series")
      .select("*")
      .eq("host_id", hostId)
      .eq("status", "active");

    if (error) fail("Could not check recurring Jios", error);
    const due = (seriesRows ?? []) as RecurringSeries[];
    if (due.length === 0) return 0;

    let generated = 0;
    const today = sgtToday();

    for (const series of due) {
      const next = nextOccurrence(series.weekday, today);
      const nextKey = dateKey(next);
      const daysAway = Math.round(
        (next.getTime() - today.getTime()) / 86400000
      );

      if (daysAway > RECURRING_LOOKAHEAD_DAYS) continue;
      if (series.last_generated_date && series.last_generated_date >= nextKey) {
        continue;
      }

      const inviteeSet = new Set(series.invitee_ids);
      if (series.kaki_id) {
        const { data: members } = await client
          .from("kaki_members")
          .select("user_id")
          .eq("kaki_id", series.kaki_id);
        for (const m of (members ?? []) as { user_id: string }[]) {
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

      const created = await supabaseRepo.createEvent(
        series.host_id,
        series.title,
        scheduledAt.toISOString(),
        series.office_id ?? DEFAULT_OFFICE.id,
        placeIds,
        series.kaki_id ?? null,
        [...inviteeSet]
      );

      await client
        .from("lunch_events")
        .update({ recurring_series_id: series.id })
        .eq("id", created.id);

      await client
        .from("recurring_series")
        .update({ last_generated_date: nextKey })
        .eq("id", series.id);

      generated += 1;
    }

    return generated;
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

  // `addedBy` isn't passed to the RPC — add_kaki_member checks auth.uid()
  // is already a member itself, same reasoning as cancel_event.
  async addKakiMember(kakiId, userId, _addedBy) {
    const client = await db();
    const { error } = await client.rpc("add_kaki_member", {
      p_kaki_id: kakiId,
      p_user_id: userId,
    });
    if (error) fail("Could not add that person to the group", error);
  },

  // ---- Lobangs ----

  async sendLobang(fromUserId, target, placeId, note, eventId) {
    const client = await db();

    let recipientIds: string[] = [];
    let kakiId: string | null = null;
    let publicToken: string | null = null;

    if (target.type === "public") {
      publicToken = generateToken();
    } else if (target.type === "kaki") {
      const { data: memberRows, error: memberError } = await client
        .from("kaki_members")
        .select("user_id")
        .eq("kaki_id", target.kakiId);
      if (memberError) fail("Could not check that Kaki's membership", memberError);

      const memberIds = ((memberRows ?? []) as { user_id: string }[]).map(
        (r) => r.user_id
      );
      if (!memberIds.includes(fromUserId)) {
        throw new Error(
          "You're not allowed to send a lobang to a Kaki you're not in"
        );
      }
      recipientIds = memberIds;
      kakiId = target.kakiId;
    } else {
      recipientIds = target.userIds;
    }

    recipientIds = Array.from(new Set(recipientIds)).filter(
      (id) => id !== fromUserId
    );
    // A public send has no recipient list to be empty in the first place.
    if (target.type !== "public" && recipientIds.length === 0) {
      throw new Error("At least one recipient is required");
    }

    const { data, error } = await client
      .from("lobangs")
      .insert({
        from_user_id: fromUserId,
        place_id: placeId,
        note: note ?? null,
        event_id: eventId ?? null,
        kaki_id: kakiId,
        public_token: publicToken,
      })
      .select()
      .single();

    if (error) fail("Could not send that lobang", error);
    const lobang = data as Lobang;

    if (recipientIds.length > 0) {
      const { error: recipientsError } = await client
        .from("lobang_recipients")
        .insert(recipientIds.map((userId) => ({ lobang_id: lobang.id, user_id: userId })));
      if (recipientsError) fail("Could not add the recipients", recipientsError);
    }

    const hydrated = await hydrateSentLobangs(client, [lobang]);
    return { ...hydrated[0], recipient_ids: recipientIds };
  },

  async listLobangsReceived(userId, limit = 20) {
    const client = await db();
    const { data: recipientRows, error: recipientError } = await client
      .from("lobang_recipients")
      .select("lobang_id")
      .eq("user_id", userId);
    if (recipientError) fail("Could not load your lobangs", recipientError);

    const lobangIds = ((recipientRows ?? []) as { lobang_id: string }[]).map(
      (r) => r.lobang_id
    );
    if (lobangIds.length === 0) return [];

    const { data, error } = await client
      .from("lobangs")
      .select("*")
      .in("id", lobangIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) fail("Could not load your lobangs", error);
    return hydrateReceivedLobangs(client, (data ?? []) as Lobang[], userId);
  },

  async listLobangsSent(userId, limit = 20) {
    const client = await db();
    const { data, error } = await client
      .from("lobangs")
      .select("*")
      .eq("from_user_id", userId)
      // A public send has nobody to appear as "sent to" here — it belongs
      // only at its own /l/[token], never in this history.
      .is("public_token", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) fail("Could not load your sent lobangs", error);
    return hydrateSentLobangs(client, (data ?? []) as Lobang[]);
  },

  async markLobangSeen(userId, lobangId) {
    const client = await db();
    const { error } = await client
      .from("lobang_recipients")
      .update({ seen_at: new Date().toISOString() })
      .eq("lobang_id", lobangId)
      .eq("user_id", userId)
      .is("seen_at", null);

    if (error) fail("Could not update that lobang", error);
  },

  async dismissLobang(userId, lobangId) {
    const client = await db();

    const { data: lobangRow } = await client
      .from("lobangs")
      .select("from_user_id")
      .eq("id", lobangId)
      .maybeSingle();

    if ((lobangRow as { from_user_id: string } | null)?.from_user_id === userId) {
      // The sender retracts the whole send — cascades to every recipient's
      // copy via the lobang_recipients foreign key.
      const { error } = await client.from("lobangs").delete().eq("id", lobangId);
      if (error) fail("Could not remove that lobang", error);
      return;
    }

    // A recipient dismissing "their copy" only removes their own row, so a
    // group send's other recipients are unaffected.
    const { error } = await client
      .from("lobang_recipients")
      .delete()
      .eq("lobang_id", lobangId)
      .eq("user_id", userId);

    if (error) fail("Could not remove that lobang", error);
  },

  async getPublicLobang(token) {
    const client = await db();
    const { data, error } = await client.rpc("get_public_lobang", {
      p_token: token,
    });

    if (error) fail("Could not load that lobang", error);
    const row = data?.[0];
    if (!row) return null;

    return {
      place: {
        id: row.place_id,
        name: row.name,
        address: row.address ?? null,
        cuisine: row.cuisine ?? [],
        custom_cuisine_tags: row.custom_cuisine_tags ?? [],
        budget_tier: row.budget_tier,
        best_dishes: row.best_dishes ?? [],
        avg_rating: row.avg_rating ?? null,
        visit_count: row.visit_count ?? 0,
        lat: row.lat,
        lng: row.lng,
        google_place_id: row.google_place_id ?? null,
      },
      from_display_name: row.from_display_name ?? "A teammate",
      note: row.note ?? null,
      created_at: row.created_at,
    };
  },

  async suggestPlacesForFriend(toUserId, limit = 5) {
    const client = await db();

    // The `visits` query runs through the sender's own session, so Row Level
    // Security (`visits_select` in 007_rls.sql) restricts it to the friend's
    // *public* rows automatically — private ratings never reach this code,
    // let alone the sender. That is also why this only ever needs the anon
    // client: nothing here requires bypassing RLS.
    const [{ data: placeRows }, { data: visitRows }] = await Promise.all([
      client.from("places").select("*").eq("status", "active"),
      client.from("visits").select("*").eq("user_id", toUserId),
    ]);

    const places = (placeRows ?? []) as Place[];
    const walks = await walkTimes(client, DEFAULT_OFFICE.id, places);

    const enriched = places.map((place) => {
      const walk = walks.get(place.id);
      return {
        ...place,
        walk_minutes: walk?.walk_minutes ?? null,
        distance_m: walk?.distance_m ?? null,
        avg_rating: place.avg_rating ?? null,
        visit_count: place.visit_count ?? 0,
      };
    });

    const friendVisits = (visitRows ?? []) as Visit[];

    return rankPlaces(enriched, friendVisits, null, [], { limit });
  },

  // ---- Admin & moderation ----
  //
  // block_place/unblock_place (SECURITY DEFINER functions, 017_admin_and_
  // moderation.sql) are the only path that can move `status` to or from
  // 'blocked' — a plain UPDATE from this client can't touch that column at
  // all (see the column-level grant in the same migration). They also do
  // all authorization and write the moderation-log row atomically, so this
  // file only calls them and re-reads the row; `userId` isn't sent to
  // Postgres because the functions authorize off `auth.uid()` from the
  // session itself, not a client-supplied value.

  async listAdminIds() {
    const client = await db();
    const { data, error } = await client.rpc("list_admin_ids");
    if (error) fail("Could not list admins", error);
    return (data as string[] | null) ?? [];
  },

  async isAdmin(userId) {
    const client = await db();
    // RLS (`admins_select_self`) only ever lets a session see its own row,
    // so this is only ever a truthful answer for the current session's user
    // — exactly how it's called (via requireUser().id from API routes).
    const { data, error } = await client
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) fail("Could not check admin status", error);
    return !!data;
  },

  async blockPlace(userId, placeId, reason) {
    const client = await db();
    const { error } = await client.rpc("block_place", {
      p_place_id: placeId,
      p_reason: reason,
    });
    if (error) fail("Could not block that place", error);

    const { data, error: readError } = await client
      .from("places")
      .select("*")
      .eq("id", placeId)
      .single();
    if (readError) fail("Blocked, but could not reload that place", readError);
    return data as Place;
  },

  async unblockPlace(userId, placeId) {
    const client = await db();
    const { error } = await client.rpc("unblock_place", {
      p_place_id: placeId,
    });
    if (error) fail("Could not unblock that place", error);

    const { data, error: readError } = await client
      .from("places")
      .select("*")
      .eq("id", placeId)
      .single();
    if (readError)
      fail("Unblocked, but could not reload that place", readError);
    return data as Place;
  },

  async listModerationLog(limit = 100) {
    const client = await db();
    const { data, error } = await client
      .from("place_moderation_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) fail("Could not load the moderation log", error);

    const entries = (data ?? []) as ModerationLogEntry[];
    if (entries.length === 0) return [];

    const [names, { data: placeRows }] = await Promise.all([
      displayNameMap(
        client,
        entries.map((e) => e.actor_id)
      ),
      client
        .from("places")
        .select("id, name")
        .in("id", Array.from(new Set(entries.map((e) => e.place_id)))),
    ]);

    const placeNameById = new Map(
      ((placeRows ?? []) as { id: string; name: string }[]).map((p) => [
        p.id,
        p.name,
      ])
    );

    return entries.map((entry) => ({
      ...entry,
      place_name: placeNameById.get(entry.place_id),
      actor_display_name: names.get(entry.actor_id),
    }));
  },

  async getAdminAnalytics(days = 90, segment = null) {
    const client = await db();
    const { data, error } = await client.rpc("get_admin_analytics", {
      p_days: days,
      p_segment: segment,
    });
    if (error) fail("Could not load analytics", error);
    return data as AdminAnalytics;
  },

  async getAdminPlaceDetail(placeId) {
    const client = await db();
    const { data, error } = await client.rpc("get_admin_place_detail", {
      p_place_id: placeId,
    });
    if (error) fail("Could not load place detail", error);
    return (data ?? null) as AdminPlaceDetail | null;
  },

  async getAdminUsersData(days = 90) {
    const client = await db();
    const { data, error } = await client.rpc("get_admin_users", {
      p_days: days,
    });
    if (error) fail("Could not load users data", error);
    return data as AdminUsersData;
  },

  async updateEngagementWeights(weights) {
    const client = await db();
    const { data, error } = await client.rpc("set_engagement_weights", {
      p_hosted: weights.hosted,
      p_voted: weights.voted,
      p_rsvp: weights.rsvp,
      p_visit: weights.visit,
      p_review: weights.review,
      p_lobang: weights.lobang,
    });
    if (error) fail("Could not update engagement weights", error);
    return data as AdminEngagementWeights;
  },

  async getAdminUserDetail(userId) {
    const client = await db();
    const { data, error } = await client.rpc("get_admin_user_detail", {
      p_user_id: userId,
    });
    if (error) fail("Could not load user detail", error);
    return (data ?? null) as AdminUserDetail | null;
  },

  async reviewPlace(userId, placeId, approve) {
    const client = await db();
    const { error } = await client.rpc("review_place", {
      p_place_id: placeId,
      p_approve: approve,
    });
    if (error) fail("Could not update that place", error);

    const { data, error: readError } = await client
      .from("places")
      .select("*")
      .eq("id", placeId)
      .single();
    if (readError) fail("Updated, but could not reload that place", readError);
    return data as Place;
  },

  // ---- Place flags ----

  async flagPlace(userId, placeId, reason, comment) {
    const client = await db();
    const { data, error } = await client
      .from("place_flags")
      .insert({
        place_id: placeId,
        flagged_by: userId,
        reason,
        comment: comment ?? null,
      })
      .select()
      .single();

    if (error) fail("Could not flag that place", error);
    const flag = data as PlaceFlag;

    const [names, { data: placeRow }] = await Promise.all([
      displayNameMap(client, [userId]),
      client.from("places").select("name").eq("id", placeId).maybeSingle(),
    ]);

    return {
      ...flag,
      place_name: (placeRow as { name: string } | null)?.name,
      flagged_by_name: names.get(userId),
    };
  },

  async listMyFlags(userId) {
    const client = await db();
    const { data, error } = await client
      .from("place_flags")
      .select("*")
      .eq("flagged_by", userId)
      .order("created_at", { ascending: false });

    if (error) fail("Could not load your reports", error);
    return hydrateFlags(client, (data ?? []) as PlaceFlag[]);
  },

  async listPendingFlags() {
    const client = await db();
    const { data, error } = await client
      .from("place_flags")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) fail("Could not load pending flags", error);
    return hydrateFlags(client, (data ?? []) as PlaceFlag[]);
  },

  async resolvePlaceFlags(adminId, placeId, resolution, reason) {
    const client = await db();
    const { error } = await client.rpc("resolve_place_flags", {
      p_place_id: placeId,
      p_resolution: resolution,
      p_reason: reason ?? null,
    });
    if (error) fail("Could not resolve that flag", error);
  },

  async listDuplicateProfiles() {
    const client = await db();
    const { data, error } = await client
      .from("profiles")
      .select("user_id, display_name, created_at")
      .order("created_at");
    if (error) fail("Could not load accounts", error);

    const groups = new Map<
      string,
      { user_id: string; display_name: string; created_at?: string }[]
    >();
    for (const row of (data ?? []) as {
      user_id: string;
      display_name: string;
      created_at?: string;
    }[]) {
      const key = row.display_name.trim().toLowerCase();
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }

    return Array.from(groups.entries())
      .filter(([, accounts]) => accounts.length > 1)
      .map(([normalized_name, accounts]) => ({ normalized_name, accounts }));
  },

  async previewAccountMerge(userId) {
    const client = await db();

    const countIn = async (table: string, column: string) => {
      const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, userId);
      if (error) fail(`Could not count ${table}`, error);
      return count ?? 0;
    };

    const [
      display_name,
      lunch_events,
      event_votes,
      event_rsvps,
      event_invitees,
      kakis,
      kaki_members,
      wishlist,
      visits,
      push_subscriptions,
    ] = await Promise.all([
      client
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => (data as { display_name: string } | null)?.display_name ?? "Unknown"),
      countIn("lunch_events", "host_id"),
      countIn("event_votes", "user_id"),
      countIn("event_rsvps", "user_id"),
      countIn("event_invitees", "user_id"),
      countIn("kakis", "created_by"),
      countIn("kaki_members", "user_id"),
      countIn("wishlist", "user_id"),
      countIn("visits", "user_id"),
      countIn("push_subscriptions", "user_id"),
    ]);

    return {
      user_id: userId,
      display_name,
      counts: {
        "Jios hosted": lunch_events,
        Votes: event_votes,
        RSVPs: event_rsvps,
        Invitations: event_invitees,
        "Kaki groups created": kakis,
        "Kaki memberships": kaki_members,
        "Wishlist saves": wishlist,
        "Visits logged": visits,
        "Push subscriptions": push_subscriptions,
      },
    };
  },

  async mergeUserAccounts(callerId, keepUserId, mergeUserId) {
    if (keepUserId === mergeUserId) {
      throw new Error("Cannot merge an account into itself");
    }

    const isAdmin = await supabaseRepo.isAdmin(callerId);
    if (callerId !== keepUserId && !isAdmin) {
      throw new Error("You may only merge another account into your own");
    }

    const client = await db();
    const { error } = await client.rpc("merge_user_accounts", {
      p_keep_user_id: keepUserId,
      p_merge_user_id: mergeUserId,
    });
    if (error) fail("Could not merge those accounts", error);

    // Retiring the old auth user needs the service role — see
    // serviceClient.ts for why this is the one other sanctioned caller.
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      mergeUserId
    );
    if (deleteError) {
      // The data has already moved — a failed cleanup here is a stray
      // empty account left behind, not a lost-data problem, so this is
      // reported but not thrown as a hard failure of the merge itself.
      console.error(
        `[account merge] moved data from ${mergeUserId} to ${keepUserId} but could not delete the old account: ${deleteError.message}`
      );
    }
  },

  // `callerId` isn't passed to the RPC — generate_recovery_token checks
  // auth.uid() against p_user_id itself, same reasoning as cancel_event.
  async generateRecoveryToken(_callerId, userId) {
    const client = await db();
    const { data, error } = await client.rpc("generate_recovery_token", {
      p_user_id: userId,
    });
    if (error) fail("Could not create a recovery link", error);
    return data as string;
  },

  async resolveRecoveryToken(token) {
    const client = await db();
    const { data, error } = await client.rpc("resolve_recovery_token", {
      p_token: token,
    });
    if (error) fail("Could not check that recovery link", error);
    return (data as string | null) ?? null;
  },

  async listCuisines() {
    const client = await db();
    const { data, error } = await client
      .from("cuisines")
      .select("slug, label, added_by, created_at")
      .order("label");
    if (error) fail("Could not load cuisines", error);
    return (data ?? []) as CuisineOption[];
  },

  async addCuisine(userId, label) {
    // Whether a non-admin may call this at all is `config.cuisineAddOpenToAnyone`,
    // checked by the API route — repos stay config-agnostic, same reasoning
    // `nameClaimEnabled` is checked in `nameAuth.ts` rather than here.
    const trimmed = label.trim();
    if (!trimmed) throw new Error("Put in a cuisine name");

    const slug = slugifyCuisine(trimmed);
    if (!slug) throw new Error("Put in a cuisine name");

    const client = await db();

    // Upsert-and-reselect rather than a plain insert: two people racing to
    // add the same cuisine should both end up pointing at the one row that
    // won, not have the loser's request throw a unique-violation error.
    const { error: upsertError } = await client
      .from("cuisines")
      .upsert(
        { slug, label: trimmed, added_by: userId },
        { onConflict: "slug", ignoreDuplicates: true }
      );
    if (upsertError) fail("Could not add that cuisine", upsertError);

    const { data, error } = await client
      .from("cuisines")
      .select("slug, label, added_by, created_at")
      .eq("slug", slug)
      .single();
    if (error) fail("Could not add that cuisine", error);
    return data as CuisineOption;
  },

  async previewCuisineMerge(slugs) {
    const client = await db();

    return Promise.all(
      slugs.map(async (slug): Promise<CuisineMergePreview> => {
        const { data: cuisineRow } = await client
          .from("cuisines")
          .select("label")
          .eq("slug", slug)
          .maybeSingle();

        // user_prefs_select (007_rls.sql) is strictly self-only, so this
        // has to go through the SECURITY DEFINER counting function rather
        // than a plain query — see 052_cuisines.sql.
        const { data: counts, error } = await client
          .rpc("count_cuisine_references", { p_slug: slug })
          .single();
        if (error) fail("Could not count references", error);
        const row = counts as { place_count: number; profile_count: number } | null;

        return {
          slug,
          label: cuisineRow?.label ?? slug,
          place_count: Number(row?.place_count ?? 0),
          profile_count: Number(row?.profile_count ?? 0),
        };
      })
    );
  },

  async mergeCuisines(callerId, keepSlug, mergeSlug) {
    if (keepSlug === mergeSlug) {
      throw new Error("Cannot merge a cuisine into itself");
    }

    const isAdmin = await supabaseRepo.isAdmin(callerId);
    if (!isAdmin) throw new Error("Admins only");

    const client = await db();
    const { error } = await client.rpc("merge_cuisines", {
      p_keep_slug: keepSlug,
      p_merge_slug: mergeSlug,
    });
    if (error) fail("Could not merge those cuisines", error);
  },

  async generatePersonalInviteToken(_callerId, userId) {
    const client = await db();
    const { data, error } = await client.rpc("generate_discovery_token", {
      p_user_id: userId,
    });
    if (error) fail("Could not create a personal invite link", error);
    return data as string;
  },

  async resolvePersonalInvite(token) {
    const client = await db();
    const { data, error } = await client
      .rpc("resolve_discovery_token", { p_token: token })
      .maybeSingle();
    if (error) fail("Could not check that invite link", error);
    if (!data) return null;
    const row = data as { user_id: string; display_name: string };
    return { user_id: row.user_id, display_name: row.display_name };
  },

  async listAllUserIds() {
    // Service-role, not the per-request anon client: this is the monthly
    // cron's iteration set, and profiles_select (authenticated, using(true))
    // would work here too, but there is no authenticated session in a cron
    // run — same reasoning as the two save methods below.
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from("profiles").select("user_id");
    if (error) fail("Could not list accounts", error);
    return (data ?? []).map((row) => row.user_id as string);
  },

  async listAllKakiIds() {
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from("kakis").select("id");
    if (error) fail("Could not list Kakis", error);
    return (data ?? []).map((row) => row.id as string);
  },

  async saveUserFoodIdentitySnapshot(userId, month, card: FoodIdentityCard) {
    // There is no user session in a cron run, so the normal anon-key path
    // would be rejected outright by RLS (068_food_identity_snapshots.sql
    // grants this table no authenticated write policy at all, by design —
    // only the cron, via this method, ever writes it). Same reasoning as
    // the discovery cron's `places` upsert.
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();
    const { error } = await admin.from("user_food_identity_snapshots").upsert(
      {
        user_id: userId,
        month,
        archetype: card.archetype,
        headline: card.headline,
        description: card.description,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,month" }
    );
    if (error) fail("Could not save that food identity snapshot", error);
  },

  async listUserFoodIdentitySnapshots(userId) {
    const client = await db();
    const { data, error } = await client
      .from("user_food_identity_snapshots")
      .select("month, archetype, headline, description, computed_at")
      .eq("user_id", userId)
      .order("month", { ascending: false });
    if (error) fail("Could not load your food identity history", error);
    return (data ?? []) as UserFoodIdentitySnapshot[];
  },

  async saveKakiFoodIdentitySnapshot(kakiId, month, card: KakiFoodIdentityCard) {
    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    const admin = createServiceRoleClient();
    const { error } = await admin.from("kaki_food_identity_snapshots").upsert(
      {
        kaki_id: kakiId,
        month,
        headline: card.headline,
        description: card.description,
        most_active_user_id: card.mostActive?.user_id ?? null,
        most_active_visits: card.mostActive?.visits ?? null,
        adventurer_user_id: card.adventurer?.user_id ?? null,
        adventurer_distinct_places: card.adventurer?.distinctPlaces ?? null,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "kaki_id,month" }
    );
    if (error) fail("Could not save that Kaki food identity snapshot", error);
  },

  async listKakiFoodIdentitySnapshots(kakiId) {
    const client = await db();
    const { data, error } = await client
      .from("kaki_food_identity_snapshots")
      .select(
        "month, headline, description, most_active_user_id, most_active_visits, adventurer_user_id, adventurer_distinct_places, computed_at"
      )
      .eq("kaki_id", kakiId)
      .order("month", { ascending: false });
    if (error) fail("Could not load this Kaki's food identity history", error);
    return (data ?? []).map((row) => ({
      month: row.month as string,
      headline: row.headline as string,
      description: row.description as string,
      computed_at: row.computed_at as string,
      mostActive:
        row.most_active_user_id && typeof row.most_active_visits === "number"
          ? { user_id: row.most_active_user_id as string, visits: row.most_active_visits }
          : null,
      adventurer:
        row.adventurer_user_id &&
        typeof row.adventurer_distinct_places === "number"
          ? {
              user_id: row.adventurer_user_id as string,
              distinctPlaces: row.adventurer_distinct_places,
            }
          : null,
    })) as KakiFoodIdentitySnapshot[];
  },
};

export default supabaseRepo;
