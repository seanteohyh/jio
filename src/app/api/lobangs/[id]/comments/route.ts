import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";

type Params = { params: Promise<{ id: string }> };

/**
 * A lobang's shared comment thread (096_lobang_comments.sql) — replaces
 * `/api/lobangs/[id]/reply`'s single, per-recipient, overwrite-in-place
 * note. The sender and every recipient of a targeted send can all read
 * and post here, back and forth, like a comments section under the
 * lobang itself.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const comments = await repo.listLobangComments(id, user.id);
    return json({ comments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ text?: string }>(request);
    if (!body?.text?.trim()) return badRequest("Say something first");

    const { participant_ids, ...comment } = await repo.postLobangComment(
      id,
      user.id,
      body.text
    );

    if (participant_ids.length > 0) {
      const claimed = await repo.claimLobangCommentPushWindow(id);
      if (claimed) {
        try {
          await sendPushToUsers(repo, participant_ids, {
            title: `${comment.display_name ?? "Someone"} commented on a lobang`,
            body: body.text.trim().slice(0, 120),
            url: "/lobangs",
          });
        } catch {
          // Logged inside sendPushToUsers already; a comment must never fail on this.
        }
      }
    }

    return json({ comment }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
