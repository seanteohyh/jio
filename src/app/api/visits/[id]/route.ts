import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import type { Visit } from "@/types";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

type VisitPatch = Partial<
  Pick<Visit, "rating" | "best_dishes" | "notes" | "visited_at" | "is_public">
>;

/**
 * Amend one of your own visits.
 *
 * Each visit is its own occasion, so a place you have been to five times has
 * five editable entries rather than one running opinion. That matches what the
 * table actually stores.
 *
 * Changing the rating recomputes `places.avg_rating` and `visit_count` through
 * migration 021's trigger — nothing to call from here.
 *
 * `is_public` is the quietly useful one: it is how you un-share a review you
 * would rather keep to yourself, without losing the visit from your own
 * history or from your metrics.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("reviews");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<VisitPatch>(request);
    if (!body) return badRequest("That didn't save — mind trying again?");

    if (
      body.rating !== undefined &&
      (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5)
    ) {
      return badRequest("Rating has to be between 1 and 5");
    }

    if (body.visited_at !== undefined) {
      const when = new Date(body.visited_at);
      if (Number.isNaN(when.getTime())) {
        return badRequest("That does not look like a valid date");
      }
      // Editing a visit's date rewrites history that metrics reads —
      // cuisine streaks are computed from these. A future date would
      // produce a streak that has not happened yet.
      if (when.getTime() > Date.now()) {
        return badRequest("You cannot log a visit in the future");
      }
    }

    const visit = await repo.updateVisit(id, user.id, body);
    return json({ visit });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Remove one of your own visits.
 *
 * A real delete, unlike places — which are blocked rather than deleted because
 * other rows point at them. Nothing points at a visit, so there is no
 * foreign-key argument for keeping a tombstone, and a review you regret should
 * actually go.
 *
 * The rating aggregates recompute on delete through the same trigger.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("reviews");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.deleteVisit(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
