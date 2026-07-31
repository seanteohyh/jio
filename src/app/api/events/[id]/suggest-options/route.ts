import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/**
 * "Can't decide? Suggest 3." Same authorization as adding an option by hand
 * — see `Repo.suggestOptionsForEvent`. `exclude_place_ids` lets the client
 * carry forward what it's already shown this session, so a re-roll doesn't
 * repeat itself.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ exclude_place_ids?: string[] }>(request);

    const added = await repo.suggestOptionsForEvent(
      id,
      user.id,
      body?.exclude_place_ids ?? []
    );

    const event = await repo.getEvent(id);
    return json({ ok: true, added, event });
  } catch (error) {
    return errorResponse(error);
  }
}
