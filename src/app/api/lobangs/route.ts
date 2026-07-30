import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, numberParam, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

/**
 * Lobangs: a personalized recommendation sent to exactly one teammate,
 * usually kicked off from a past Jio on the sender's profile.
 *
 * `?direction=received` (default) is the sender's inbox; `?direction=sent`
 * is their own outgoing history. Both are scoped to the signed-in user —
 * nobody else's lobangs are reachable through this route, and RLS backs
 * that up in live mode.
 */
export async function GET(request: NextRequest) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const direction = params.get("direction") === "sent" ? "sent" : "received";
    const limit = numberParam(params, "limit", 20);

    const lobangs =
      direction === "sent"
        ? await repo.listLobangsSent(user.id, limit)
        : await repo.listLobangsReceived(user.id, limit);

    return json({ lobangs, direction });
  } catch (error) {
    return errorResponse(error);
  }
}

interface SendLobangBody {
  to_user_id?: string;
  place_id?: string;
  note?: string;
  event_id?: string | null;
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<SendLobangBody>(request);

    if (!body?.to_user_id) return badRequest("Who is this for?");
    if (!body.place_id) return badRequest("Which place?");
    if (body.to_user_id === user.id) {
      return badRequest("You can't send a lobang to yourself");
    }

    const lobang = await repo.sendLobang(
      user.id,
      body.to_user_id,
      body.place_id,
      body.note?.trim() || null,
      body.event_id ?? null
    );

    return json({ lobang }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
