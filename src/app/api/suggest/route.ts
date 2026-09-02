import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, listParam, numberParam } from "@/lib/api";
import { getWeatherProvider } from "@/lib/providers/weather";
import { groupRecommend, rankPlaces, surprisePick, whyHint } from "@/lib/recommend";
import { RECOMMEND_CONFIG } from "@/lib/recommendConfig";
import { DEFAULT_OFFICE } from "@/lib/constants";
import { isEnabled } from "@/lib/config";
import type { MemberData, ScoredPlace } from "@/types";

/**
 * The suggestion endpoint.
 *
 * Assembles everything the pure ranking functions need — places, the user's
 * history and preferences, wishlist, and the weather — then gets out of the
 * way. All the actual judgement lives in `lib/recommend.ts`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const mode = params.get("mode") ?? "personal";
    const kakiId = params.get("kakiId");
    const limit = numberParam(params, "limit", 12);
    const cuisines = listParam(params, "cuisines");

    // Suggest Area Filter spec §4 — an ad-hoc reference point for one
    // request, resolved client-side (from a chosen station or a dropped
    // pin) before this fetch ever fires, so both input methods have
    // already collapsed to the same {lat, lng} shape by the time they
    // reach here. Both must be present and parse as finite numbers, or
    // this falls through to today's office-relative resolution unchanged.
    const areaLatRaw = params.get("areaLat");
    const areaLngRaw = params.get("areaLng");
    const areaLat = areaLatRaw !== null ? Number(areaLatRaw) : NaN;
    const areaLng = areaLngRaw !== null ? Number(areaLngRaw) : NaN;
    const hasArea = Number.isFinite(areaLat) && Number.isFinite(areaLng);

    // No existing convention for a "typical distance" around an arbitrary
    // point the way there is for a fixed office — 15 minutes is a
    // placeholder default that only applies when an area is active and the
    // caller hasn't also passed an explicit ?maxWalk=; office-relative
    // requests keep their existing unfiltered-by-default behaviour.
    const maxWalk = params.has("maxWalk")
      ? numberParam(params, "maxWalk", 20)
      : hasArea
        ? 15
        : undefined;

    const [visits, prefs, wishlist, offices] = await Promise.all([
      repo.listVisits(undefined, user.id),
      repo.getUserPrefs(user.id),
      isEnabled("wishlist") ? repo.listWishlist(user.id) : Promise.resolve([]),
      repo.listOffices(),
    ]);

    // When an area is active, this request never resolves or references an
    // officeId at all — it's a pure {lat, lng} point passed straight
    // through to listPlaces/walkTimes. Otherwise, same resolution
    // /api/places and /api/users already use: the caller's own
    // default_office_id first, falling back to DEFAULT_OFFICE; an explicit
    // ?officeId= still wins over both.
    const officeId: string | { lat: number; lng: number } = hasArea
      ? { lat: areaLat, lng: areaLng }
      : (params.get("officeId") ??
        (isEnabled("offices") ? prefs?.default_office_id : null) ??
        DEFAULT_OFFICE.id);
    const { places } = await repo.listPlaces({ status: "active", officeId });

    const office: { lat: number; lng: number } = hasArea
      ? { lat: areaLat, lng: areaLng }
      : (offices.find((o) => o.id === officeId) ?? offices[0] ?? DEFAULT_OFFICE);

    // Rain doubles the walk penalty, which quietly pulls closer places up the
    // list. Never blocks: a failed forecast is just no forecast.
    const forecast = await getWeatherProvider().forecast(office.lat, office.lng);
    const weatherMultiplier = forecast?.rainLikely
      ? RECOMMEND_CONFIG.walk.rainMultiplier
      : 1;

    const options = {
      weatherMultiplier,
      limit,
      cuisines: cuisines.length > 0 ? cuisines : undefined,
      maxWalkMinutes: maxWalk,
    };

    let ranked: ScoredPlace[];

    if (mode === "group" && kakiId && isEnabled("kakis")) {
      const kaki = await repo.getKaki(kakiId);
      if (!kaki) {
        ranked = rankPlaces(
          places,
          visits,
          prefs,
          wishlist.map((w) => w.place_id),
          options
        );
      } else {
        const membersData: MemberData[] = await Promise.all(
          kaki.members.map(async (member) => {
            const [memberVisits, memberPrefs, memberWishlist] =
              await Promise.all([
                repo.listVisits(undefined, member.user_id),
                repo.getUserPrefs(member.user_id),
                member.user_id === user.id
                  ? Promise.resolve(wishlist)
                  : Promise.resolve([]),
              ]);
            return {
              userId: member.user_id,
              visits: memberVisits,
              prefs: memberPrefs,
              wishlistPlaceIds: memberWishlist.map((w) => w.place_id),
            };
          })
        );
        ranked = groupRecommend(membersData, places, options);
      }
    } else {
      ranked = rankPlaces(
        places,
        visits,
        prefs,
        wishlist.map((w) => w.place_id),
        options
      );
    }

    // The surprise pick is drawn from the full eligible set, not the truncated
    // top-N, or it would never surprise anyone.
    const fullRanking =
      mode === "group"
        ? ranked
        : rankPlaces(
            places,
            visits,
            prefs,
            wishlist.map((w) => w.place_id),
            { ...options, limit: undefined }
          );
    const surprise = surprisePick(fullRanking);

    return json({
      suggestions: ranked.map((s) => ({ ...s, why: whyHint(s) })),
      surprise: surprise ? { ...surprise, why: whyHint(surprise) } : null,
      weather: forecast,
      mode,
      office,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
