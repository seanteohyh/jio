import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json, readJson } from "@/lib/api";

interface MergeBody {
  keep_cuisine_slug?: string;
  merge_cuisine_slugs?: string[];
}

/**
 * §6 — admin-triggered cuisine combine, catching the near-duplicates
 * normalize-on-write doesn't ("Korean BBQ" / "korean bbq" / "KBBQ").
 * Mirrors `merge-accounts`: each merge runs through the same
 * `mergeCuisines` (one keeper, one loser, sequential — no reason to race
 * updates against the same `places`/`user_prefs` rows).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const body = await readJson<MergeBody>(request);
    const keepSlug = body?.keep_cuisine_slug;
    const mergeSlugs = body?.merge_cuisine_slugs;

    if (!keepSlug) return badRequest("Which cuisine should stay?");
    if (!Array.isArray(mergeSlugs) || mergeSlugs.length === 0) {
      return badRequest("Pick at least one cuisine to merge in");
    }
    if (mergeSlugs.includes(keepSlug)) {
      return badRequest("Cannot merge the kept cuisine into itself");
    }

    for (const mergeSlug of mergeSlugs) {
      await repo.mergeCuisines(user.id, keepSlug, mergeSlug);
    }

    return json({ ok: true, merged: mergeSlugs.length });
  } catch (error) {
    return errorResponse(error);
  }
}
