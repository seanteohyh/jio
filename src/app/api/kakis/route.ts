import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { logAction } from "@/lib/actions";

export async function GET() {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const kakis = await repo.listKakis(user.id);
    return json({ kakis });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ name?: string; join_token?: string }>(request);

    // The same endpoint handles joining, so an invite link can post here
    // without the client needing to know which case it is.
    if (body?.join_token) {
      const kaki = await repo.joinKaki(body.join_token, user.id);
      return json({ kaki, joined: true });
    }

    const name = body?.name?.trim();
    if (!name) return badRequest("Give the group a name");
    if (name.length > 60) return badRequest("That name is a bit long");

    const kaki = await repo.createKaki(user.id, name);
    await logAction(repo, user.id, "kaki.created", { kakiId: kaki.id });
    return json({ kaki }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
