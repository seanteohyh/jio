import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import {
  badRequest,
  errorResponse,
  json,
  listParam,
  numberParam,
  readJson,
} from "@/lib/api";
import { DEFAULT_OFFICE } from "@/lib/constants";
import { isEnabled } from "@/lib/config";
import { computeKakiRatingByPlace, countKakiVisitsByPlace } from "@/lib/metrics";
import { resolveAndStoreGooglePlaceId } from "@/lib/googlePlaces";
import { isHttpUrl } from "@/lib/utils";
import { logAction } from "@/lib/actions";
import type { BudgetTier, Filters, Place, PlaceStatus } from "@/types";

/** A lone review shouldn't read as group consensus — CHANGES_20260807c.md §2. */
const MIN_KAKI_VISITS_FOR_BADGE = 2;

const PAGE_SIZE = 15;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    // Paging is opt-in: only a caller that passes `page` gets a sliced
    // result. Everyone else (the map, /suggest's ranking, search boxes)
    // keeps getting the full matching list, unchanged.
    const pageParam = params.get("page");
    const page = pageParam ? Math.max(1, numberParam(params, "page", 1)) : null;
    const limit = numberParam(params, "limit", PAGE_SIZE);

    // Walk times default to the caller's own `user_prefs.default_office_id`
    // — the same resolution /api/users already uses for its office-scoped
    // discovery — rather than the fixed DEFAULT_OFFICE, so someone who set
    // a different office on their Profile page actually sees distances
    // measured from it, matching that field's own "Walking times are
    // measured from here" hint. An explicit `?officeId=` still wins over
    // both, same as before this fix.
    let defaultOfficeId: string = DEFAULT_OFFICE.id;
    if (isEnabled("offices")) {
      const prefs = await repo.getUserPrefs(user.id);
      if (prefs?.default_office_id) defaultOfficeId = prefs.default_office_id;
    }

    const baseFilters: Omit<Filters, "sortBy"> = {
      cuisines: listParam(params, "cuisines"),
      budgetMin: numberParam(params, "budgetMin", 1) as BudgetTier,
      budgetMax: numberParam(params, "budgetMax", 6) as BudgetTier,
      maxWalkMinutes: numberParam(params, "maxWalk", 60),
      status: (params.get("status") as PlaceStatus | "all") ?? "active",
      search: params.get("q") ?? "",
      officeId: params.get("officeId") ?? defaultOfficeId,
    };

    const sortBy = params.get("sortBy");
    const kakiFavouritesOnly = params.get("kakiFavouritesOnly") === "true";

    // §12f / CHANGES_20260807c.md §2 — anything Kaki-rating-related needs the
    // requesting user's Kaki membership, which the repo's listPlaces has no
    // notion of, so it's computed here rather than pushed down like
    // "walk"/"rating" are. Skipped entirely for someone in no Kaki at all —
    // "your Kakis' opinion" from a member set of just yourself isn't a
    // signal worth the extra visit-list fetches.
    let kakiRatingByPlace: Record<string, number> = {};
    if (isEnabled("kakis")) {
      const kakis = await repo.listKakis(user.id);
      if (kakis.length > 0) {
        const memberIds = new Set<string>([user.id]);
        for (const kaki of kakis) {
          const detail = await repo.getKaki(kaki.id);
          for (const member of detail?.members ?? []) {
            memberIds.add(member.user_id);
          }
        }

        const visitLists = await Promise.all(
          Array.from(memberIds).map((id) => repo.listVisits(undefined, id))
        );
        const allVisits = visitLists.flat();
        const ratings = computeKakiRatingByPlace(allVisits, memberIds);
        const counts = countKakiVisitsByPlace(allVisits, memberIds);

        // A lone review reads as one person's opinion, not "your Kakis
        // liked this" — held back from both the badge and the filter until
        // there's at least MIN_KAKI_VISITS_FOR_BADGE behind it.
        for (const placeId of Object.keys(ratings)) {
          if ((counts[placeId] ?? 0) >= MIN_KAKI_VISITS_FOR_BADGE) {
            kakiRatingByPlace[placeId] = ratings[placeId];
          }
        }
      }
    }

    const attachKakiRating = (place: Place): Place => ({
      ...place,
      kaki_rating: kakiRatingByPlace[place.id] ?? null,
    });

    // A real sort or a real filter over kaki_rating both need the full
    // matching set scored before slicing — neither can use the repo's own
    // pagination.
    if (sortBy === "kaki_rating" || kakiFavouritesOnly) {
      const { places: allPlaces } = await repo.listPlaces(baseFilters);
      let scored = allPlaces.map(attachKakiRating);

      if (kakiFavouritesOnly) {
        scored = scored.filter((p) => typeof p.kaki_rating === "number");
      }
      if (sortBy === "kaki_rating") {
        scored = [...scored].sort((a, b) => {
          const aR = typeof a.kaki_rating === "number" ? a.kaki_rating : -Infinity;
          const bR = typeof b.kaki_rating === "number" ? b.kaki_rating : -Infinity;
          if (aR !== bR) return bR - aR;
          const aW = typeof a.walk_minutes === "number" ? a.walk_minutes : Infinity;
          const bW = typeof b.walk_minutes === "number" ? b.walk_minutes : Infinity;
          if (aW !== bW) return aW - bW;
          return a.name.localeCompare(b.name);
        });
      }

      const total = scored.length;
      const places = page
        ? scored.slice((page - 1) * limit, (page - 1) * limit + limit)
        : scored;

      return json({ places, total });
    }

    const { places, total } = await repo.listPlaces(
      {
        ...baseFilters,
        sortBy:
          sortBy === "rating" || sortBy === "newly_rated" ? sortBy : "walk",
      },
      page ? { limit, offset: (page - 1) * limit } : undefined
    );

    return json({ places: places.map(attachKakiRating), total });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreatePlaceBody {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  cuisine?: string[];
  custom_cuisine_tags?: string[];
  budget_tier?: number;
  best_dishes?: string[];
  notes?: string;
  socials_url?: string;
  status?: PlaceStatus;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreatePlaceBody>(request);

    if (!body) return badRequest("That didn't save — mind trying again?");
    if (!body.name?.trim()) return badRequest("A name is required");
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return badRequest("Latitude and longitude are required");
    }

    const tier = body.budget_tier ?? 2;
    if (tier < 1 || tier > 6) {
      return badRequest("Budget tier must be between 1 and 6");
    }

    const socialsUrl = body.socials_url?.trim() || null;
    if (socialsUrl && !isHttpUrl(socialsUrl)) {
      return badRequest("Socials link must be a valid http(s) URL");
    }

    const place = await repo.createPlace({
      name: body.name.trim(),
      address: body.address?.trim() || null,
      lat: body.lat,
      lng: body.lng,
      cuisine: body.cuisine ?? [],
      custom_cuisine_tags: body.custom_cuisine_tags ?? [],
      budget_tier: tier as BudgetTier,
      osm_id: null,
      source: "manual",
      status: body.status ?? "active",
      best_dishes: body.best_dishes ?? [],
      notes: body.notes?.trim() || null,
      socials_url: socialsUrl,
      created_by: user.id,
    } as Omit<Place, "id" | "created_at" | "updated_at" | "google_place_id">);

    // Best-effort — never lets a Places lookup failure block adding a
    // place. No-ops entirely without GOOGLE_PLACES_API_KEY configured.
    await resolveAndStoreGooglePlaceId(repo, place);
    await logAction(repo, user.id, "place.created", { placeId: place.id });

    return json({ place }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
