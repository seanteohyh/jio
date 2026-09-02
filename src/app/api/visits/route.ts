import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { logAction } from "@/lib/actions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const placeId = params.get("placeId") ?? undefined;
    // Default to the caller's own visits; RLS would block anyone else's
    // private ones anyway, so asking for them is pointless.
    const userId = params.get("all") === "true" ? undefined : user.id;

    const visits = await repo.listVisits(placeId, userId);
    return json({ visits });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateVisitBody {
  place_id?: string;
  rating?: number;
  best_dishes?: string[];
  notes?: string;
  visited_at?: string;
  is_public?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreateVisitBody>(request);

    if (!body) return badRequest("That didn't save — mind trying again?");
    if (!body.place_id) return badRequest("Which place did you go to?");

    const rating = body.rating ?? 0;
    if (rating < 1 || rating > 5) {
      return badRequest("Rating must be between 1 and 5");
    }

    const visit = await repo.createVisit({
      place_id: body.place_id,
      user_id: user.id,
      rating,
      best_dishes: body.best_dishes ?? [],
      notes: body.notes?.trim() || null,
      visited_at: body.visited_at ?? new Date().toISOString().slice(0, 10),
      // UX review log #19 — reviews are public by default now (a
      // deliberate reversal of the original private-by-default stance),
      // so an omitted field falls back to visible, not hidden.
      is_public: body.is_public ?? true,
    });

    // A public visit is a review; a private one is just a log entry —
    // the same distinction `is_public` already draws everywhere else in
    // this schema, not a second flag.
    await logAction(repo, user.id, visit.is_public ? "place.reviewed" : "place.visited", {
      placeId: visit.place_id,
      visitId: visit.id,
    });

    return json({ visit }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
