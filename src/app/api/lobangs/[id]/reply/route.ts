import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";

type Params = { params: Promise<{ id: string }> };

/** A recipient's freeform text reply back to a lobang's sender — CHANGES §3. */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ text?: string }>(request);
    if (!body?.text?.trim()) return badRequest("Say something first");

    const result = await repo.replyToLobang(user.id, id, body.text);

    if (result.from_user_id !== user.id) {
      try {
        await sendPushToUsers(repo, [result.from_user_id], {
          title: "Someone replied to your lobang",
          body: body.text.trim().slice(0, 120),
          url: "/profile",
        });
      } catch {
        // Logged inside sendPushToUsers already; a reply must never fail on this.
      }
    }

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
