import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json } from "@/lib/api";

/**
 * Part 1 §B §2 — the composite engagement score is "equal weight for now,
 * but admin-adjustable," which is this endpoint: the one way to change
 * `admin_engagement_weights` (migration 064). Admin only.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const keys = ["hosted", "voted", "rsvp", "visit", "review", "lobang"] as const;
    const weights: Record<(typeof keys)[number], number> = {
      hosted: 0,
      voted: 0,
      rsvp: 0,
      visit: 0,
      review: 0,
      lobang: 0,
    };
    for (const key of keys) {
      const value = body?.[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return badRequest(`${key} weight must be a non-negative number`);
      }
      weights[key] = value;
    }

    const updated = await repo.updateEngagementWeights(weights);
    return json({ weights: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
