import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const profile = await repo.getProfile(user.id);
    return json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ display_name?: string }>(request);

    const name = body?.display_name?.trim();
    if (!name) return badRequest("A display name is required");
    if (name.length > 40) return badRequest("That name is a bit long");

    const profile = await repo.upsertProfile(user.id, name);
    return json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
