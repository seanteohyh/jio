import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, numberParam, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { lobangShareUrl } from "@/lib/shareUrl";
import { sendPushToUsers } from "@/lib/push";
import { logAction } from "@/lib/actions";
import type { Repo } from "@/lib/data";
import type { Lobang } from "@/types";

/**
 * Lobangs: a personalized recommendation sent to specific teammates, a
 * whole Kaki, or — CHANGES_20260816.md §4 — publicly, as an attributed
 * link anyone can open. Usually kicked off from a past Jio on the
 * sender's profile, or "Share this lobang" on a place's own page.
 *
 * `?direction=received` (default) is the sender's inbox; `?direction=sent`
 * is their own outgoing history. Both are scoped to the signed-in user —
 * nobody else's lobangs are reachable through this route, and RLS backs
 * that up in live mode. Neither ever includes a public send: there's no
 * recipient to receive it, and it isn't meant to clutter the sender's own
 * history either — its one home is its own `/l/[token]` link.
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

/**
 * CHANGES_20260819e.md §1 — the one notification type that had never
 * pushed at all, despite everything else the app sends (Jio invites,
 * votes, the 30-min reminder, decisions, review likes, the weekly recap)
 * already doing so. Never fires for a public send — `recipient_ids` is
 * empty for one, since there is nobody specific to notify.
 */
async function notifyOfLobang(
  repo: Repo,
  lobang: Lobang & { recipient_ids: string[] }
): Promise<void> {
  if (lobang.recipient_ids.length === 0) return;
  try {
    await sendPushToUsers(repo, lobang.recipient_ids, {
      title: `${lobang.from_display_name ?? "Someone"} sent you a lobang`,
      body: lobang.place?.name ?? "Take a look",
      url: "/lobangs",
    });
  } catch {
    // Logged inside sendPushToUsers already; a lobang must never fail on this.
  }
}

interface SendLobangBody {
  /** Any one of these three, never more than one. */
  to_user_ids?: string[];
  kaki_id?: string;
  public?: boolean;
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

    if (!body?.place_id) return badRequest("Which place?");

    const hasUsers = !!body.to_user_ids && body.to_user_ids.length > 0;
    const targetCount = [hasUsers, !!body.kaki_id, !!body.public].filter(
      Boolean
    ).length;

    if (targetCount === 0) return badRequest("Who is this for?");
    if (targetCount > 1) {
      return badRequest(
        "Pick one — teammates, a Kaki, or a public link, not more than one"
      );
    }

    const target = body.public
      ? ({ type: "public" } as const)
      : body.kaki_id
        ? ({ type: "kaki", kakiId: body.kaki_id } as const)
        : ({ type: "users", userIds: body.to_user_ids! } as const);

    const lobang = await repo.sendLobang(
      user.id,
      target,
      body.place_id,
      body.note?.trim() || null,
      body.event_id ?? null
    );

    await notifyOfLobang(repo, lobang);
    await logAction(repo, user.id, "lobang.sent", {
      placeId: body.place_id,
      target: target.type,
    });

    const url = lobang.public_token
      ? lobangShareUrl(lobang.public_token)
      : undefined;

    return json({ lobang, url }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
