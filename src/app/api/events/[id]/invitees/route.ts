import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ user_ids?: string[] }>(request);
    if (!Array.isArray(body?.user_ids)) {
      return badRequest("Expected user_ids to be an array");
    }

    await repo.addInviteesToEvent(id, body.user_ids, user.id);

    const event = await repo.getEvent(id);
    return json({ ok: true, event: event && redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
