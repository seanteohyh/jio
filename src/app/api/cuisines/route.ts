import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json, readJson } from "@/lib/api";
import { config } from "@/lib/config";

/**
 * The live, runtime-extensible cuisine list — CHANGES_20260818.md §6.
 * Replaces the old hardcoded `CUISINES` constant everywhere a cuisine
 * picker needs the full list.
 */
export async function GET() {
  try {
    await requireUser();
    const repo = await getRepoAsync();
    const cuisines = await repo.listCuisines();
    return json({ cuisines });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Promotes a typed cuisine into the shared list. Open to any signed-in user
 * by default (`config.cuisineAddOpenToAnyone`) — "for now, open to anyone,
 * not just admins... may become admin-gated later," per Sean's explicit
 * framing. Flipping that flag to admin-only is this one check, not a
 * rewrite.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    if (!config.cuisineAddOpenToAnyone) {
      const repo = await getRepoAsync();
      const admin = await repo.isAdmin(user.id);
      if (!admin) return forbidden("Only an admin can add a new cuisine right now");
    }

    const body = await readJson<{ label?: string }>(request);
    const label = body?.label?.trim();
    if (!label) return badRequest("Put in a cuisine name");
    if (label.length > 40) return badRequest("That name is a bit long");

    const repo = await getRepoAsync();
    const cuisine = await repo.addCuisine(user.id, label);
    return json({ cuisine });
  } catch (error) {
    return errorResponse(error);
  }
}
