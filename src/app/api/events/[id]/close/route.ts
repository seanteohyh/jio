import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";

type Params = { params: Promise<{ id: string }> };

/**
 * Close the vote and lock in a winner.
 *
 * With no body, the Borda count decides. With `winner_place_id`, the host is
 * overriding — either because the roulette wheel spun, or because they simply
 * decided. Only the host can do either.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ winner_place_id?: string | null }>(request);

    const event = await repo.closeEvent(
      id,
      user.id,
      body?.winner_place_id ?? null
    );

    return json({ ok: true, event: redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
