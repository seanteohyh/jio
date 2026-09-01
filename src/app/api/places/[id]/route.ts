import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import {
  badRequest,
  errorResponse,
  forbidden,
  json,
  notFound,
  readJson,
} from "@/lib/api";
import { resolveAndStoreGooglePlaceId } from "@/lib/googlePlaces";
import { isHttpUrl } from "@/lib/utils";
import type { Place } from "@/types";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const place = await repo.getPlace(id);
    if (!place) return notFound("That place does not exist");

    const reviews = await repo.listPublicReviews(id, user.id);

    return json({ place, reviews });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<Partial<Place>>(request);
    if (!body) return badRequest("That didn't save — mind trying again?");

    // Status moves through dedicated /block, /unblock and /review endpoints
    // now — each has its own authorization rule (creator-or-admin, admin
    // only, any signed-in user respectively). A plain PUT can no longer
    // touch it at all in live mode (see the column-level grant in
    // 017_admin_and_moderation.sql), so reject it here too rather than let
    // demo mode silently behave differently from live mode.
    if ("status" in body) {
      return badRequest(
        "Use /block, /unblock or /review to change a place's status"
      );
    }

    if (
      typeof body.budget_tier === "number" &&
      (body.budget_tier < 1 || body.budget_tier > 6)
    ) {
      return badRequest("Budget tier must be between 1 and 6");
    }

    if (
      typeof body.socials_url === "string" &&
      body.socials_url.trim() &&
      !isHttpUrl(body.socials_url.trim())
    ) {
      return badRequest("Socials link must be a valid http(s) URL");
    }
    if (typeof body.socials_url === "string") {
      body.socials_url = body.socials_url.trim() || null;
    }

    const place = await repo.updatePlace(id, body);

    // Only re-resolve when the match-relevant fields actually changed — a
    // budget/cuisine/notes-only edit has no reason to spend a lookup.
    // Best-effort, same as on create: never blocks the edit itself.
    if (body.name !== undefined || body.address !== undefined) {
      await resolveAndStoreGooglePlaceId(repo, place);
    }

    return json({ place });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Hard-delete a place. **Admin only.**
 *
 * This previously required nothing beyond a signed-in session — the same
 * class of gap that the 30 Jul change closed for `status` on PUT, but the
 * DELETE verb was missed. Nothing in the UI calls this, so the exposure was
 * never reachable through the app, but the endpoint was live.
 *
 * Deleting is deliberately the rarer path. The ordinary way to take a place
 * out of circulation is `/block`, which any signed-in user can do with a
 * reason and which leaves the row (and its visits, options and lobangs)
 * intact. A real DELETE risks foreign-key trouble the moment a place has any
 * of those pointing at it, so it exists only for genuine junk — an OSM vending
 * machine tagged as a café — and only an admin gets to make that call.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) {
      return forbidden(
        "Only an admin can delete a place. Use block to take it out of " +
          "suggestions instead."
      );
    }

    await repo.deletePlace(id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
