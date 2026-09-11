import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";

type Params = { params: Promise<{ id: string }> };

/**
 * Toggle the recipient's heart on a lobang they received — CHANGES §3.
 * Same "one endpoint, on if off, off if on" shape as `/api/visits/[id]/like`.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const result = await repo.toggleLobangLike(user.id, id);

    if (result.liked && result.from_user_id !== user.id) {
      try {
        await sendPushToUsers(repo, [result.from_user_id], {
          title: "Someone liked your lobang",
          body: "They appreciated the tip-off.",
          url: "/profile",
        });
      } catch {
        // Logged inside sendPushToUsers already; a like must never fail on this.
      }
    }

    return json({ liked: result.liked });
  } catch (error) {
    return errorResponse(error);
  }
}
