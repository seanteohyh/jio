import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

/**
 * Confirm or dismiss a freshly-discovered (`needs_review`) place. Any
 * signed-in user may call this — it's crowd-confirmation of OSM data
 * quality, not moderation of an established place, so there's no admin or
 * creator gate and no reason required (unlike /block).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ approve?: boolean }>(request);
    if (typeof body?.approve !== "boolean") {
      return badRequest("Expected { approve: boolean }");
    }

    const place = await repo.reviewPlace(user.id, id, body.approve);
    return json({ place });
  } catch (error) {
    return errorResponse(error);
  }
}
