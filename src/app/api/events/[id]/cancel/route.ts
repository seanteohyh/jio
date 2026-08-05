import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";

type Params = { params: Promise<{ id: string }> };

/**
 * Call off an open Jio. Host only — see 030_cancel_event.sql for why this
 * goes through `cancelEvent` rather than a plain status write.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const event = await repo.cancelEvent(id, user.id);
    return json({ ok: true, event: redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
