import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";

/**
 * Places "Tried" — never user-toggled, unlike the wishlist/favourites: a
 * place lands here on its own once you've logged a review for it, or
 * actually attended a Jio that was decided there and has since happened
 * (`listTriedPlaceIds`) — a Jio decided for next Friday doesn't count yet,
 * same "Going to" vs "Went to" tense already used on the Jio itself. No
 * feature flag of its own — both signals it's built from (visits, Jio
 * attendance) are always-on parts of the app, not optional slices.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const places = await repo.listTried(user.id);
    return json({ places });
  } catch (error) {
    return errorResponse(error);
  }
}
