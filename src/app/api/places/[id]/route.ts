import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import {
  badRequest,
  errorResponse,
  json,
  notFound,
  readJson,
} from "@/lib/api";
import type { Place } from "@/types";

// Next 15+ hands route params in as a Promise.
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const place = await repo.getPlace(id);
    if (!place) return notFound("That place does not exist");

    const [reviews, recos] = await Promise.all([
      repo.listPublicReviews(id),
      repo.listRecosForPlace(id),
    ]);

    return json({ place, reviews, recos });
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
    if (!body) return badRequest("Expected a JSON body");

    if (
      typeof body.budget_tier === "number" &&
      (body.budget_tier < 1 || body.budget_tier > 4)
    ) {
      return badRequest("Budget tier must be between 1 and 4");
    }

    const place = await repo.updatePlace(id, body);
    return json({ place });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.deletePlace(id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
