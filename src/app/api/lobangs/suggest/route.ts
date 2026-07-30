import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, numberParam } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { whyHint } from "@/lib/recommend";

/**
 * Places ranked for a specific teammate, for the "send a lobang" composer.
 *
 * Reuses the same scoring engine as `/api/suggest`, just pointed at someone
 * else's public history instead of the caller's own — see
 * `Repo.suggestPlacesForFriend` for why that stays privacy-safe.
 */
export async function GET(request: NextRequest) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const toUserId = params.get("to");
    if (!toUserId) return badRequest("Who is this for?");

    const limit = numberParam(params, "limit", 6);
    const suggestions = await repo.suggestPlacesForFriend(toUserId, limit);

    return json({
      suggestions: suggestions.map((s) => ({ ...s, why: whyHint(s) })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
