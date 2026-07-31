import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

/** Completes the one-time /welcome screen. See `Repo.completeOnboarding`. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ display_name?: string }>(request);

    const name = body?.display_name?.trim();
    if (!name) return badRequest("Put in a name so people know who you are");
    if (name.length > 40) return badRequest("That name is a bit long");

    const profile = await repo.completeOnboarding(user.id, name);
    return json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
