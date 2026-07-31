import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json, readJson } from "@/lib/api";
import type { FlagResolution } from "@/types";

type Params = { params: Promise<{ placeId: string }> };

const VALID_RESOLUTIONS: FlagResolution[] = ["dismissed", "edited", "blocked"];

/**
 * Resolves every pending flag on a place in one action — admin only.
 * `resolution: "blocked"` also blocks the place (requires `reason`, same as
 * `/block`); `dismissed`/`edited` just close out the flags.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { placeId } = await params;
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const body = await readJson<{ resolution?: string; reason?: string }>(request);
    const resolution = body?.resolution as FlagResolution | undefined;
    if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
      return badRequest("Pick a resolution");
    }
    if (resolution === "blocked" && !body?.reason?.trim()) {
      return badRequest("A reason is required to block a place");
    }

    await repo.resolvePlaceFlags(
      user.id,
      placeId,
      resolution,
      body?.reason?.trim() || null
    );
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
