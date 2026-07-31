import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, errorResponse, json } from "@/lib/api";
import { geocodeAddress } from "@/lib/onemap";

/**
 * Turns an address or postal code into coordinates for the "add a place"
 * forms — nobody should have to type latitude/longitude by hand. Backed by
 * OneMap's public search endpoint (Singapore only, matches the rest of the
 * app's Singapore-only assumptions).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q) return badRequest("Give an address or postal code to look up");

    const result = await geocodeAddress(q);
    if (!result) {
      return json({
        result: null,
        message: "Couldn't find that — try a more specific address or postal code.",
      });
    }

    return json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
