import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/**
 * Dismisses the "turn this into a Kaki?" bridge suggestion for this Jio,
 * for the caller only — host-only in practice (nobody else is ever shown
 * it), but not re-checked here since dismissing a suggestion nobody else
 * can see is harmless even if attempted directly. Idempotent, same shape
 * as every other one-shot "mark this seen" write in this schema.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.dismissKakiBridgeSuggestion(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
