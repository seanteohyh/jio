import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, errorResponse, json, numberParam } from "@/lib/api";
import { getRoutingProvider } from "@/lib/providers/routing";
import { DEFAULT_OFFICE } from "@/lib/constants";

/**
 * Walking route between the office and a point, for drawing on the map.
 *
 * Falls back to a straight line when no routing provider is configured, so the
 * map always has something to draw.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;

    const toLat = params.get("toLat");
    const toLng = params.get("toLng");
    if (!toLat || !toLng) {
      return badRequest("Destination coordinates are required");
    }

    const to = { lat: Number(toLat), lng: Number(toLng) };
    if (Number.isNaN(to.lat) || Number.isNaN(to.lng)) {
      return badRequest("Those coordinates are not valid numbers");
    }

    const from = {
      lat: numberParam(params, "fromLat", DEFAULT_OFFICE.lat),
      lng: numberParam(params, "fromLng", DEFAULT_OFFICE.lng),
    };

    const provider = getRoutingProvider();
    const route = await provider.route(from, to);

    return json({ route, provider: provider.name });
  } catch (error) {
    return errorResponse(error);
  }
}
