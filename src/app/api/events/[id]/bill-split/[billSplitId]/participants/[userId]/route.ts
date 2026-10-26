import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string; billSplitId: string; userId: string }> };

interface ParticipantBody {
  /** Present (including explicit `null` to clear it) vs. absent
   *  distinguishes "set the phone number" from "leave it alone" — the
   *  same shape `PATCH /api/events/[id]` already uses for optional
   *  fields. */
  phone_number?: string | null;
  paid?: boolean;
}

/**
 * Host-only, two independent optional fields in one body so the UI can
 * fire either (or both) in a single request — the phone-number field and
 * the "mark as paid" toggle sit right next to each other on the same
 * breakdown row.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { billSplitId, userId } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<ParticipantBody>(request);
    if (!body || (body.phone_number === undefined && body.paid === undefined)) {
      return badRequest("Nothing to update");
    }

    let billSplit;
    if (body.phone_number !== undefined) {
      billSplit = await repo.setBillSplitParticipantPhone(
        billSplitId,
        user.id,
        userId,
        body.phone_number
      );
    }
    if (body.paid !== undefined) {
      billSplit = await repo.setBillSplitPaid(billSplitId, user.id, userId, body.paid);
    }

    return json({ billSplit });
  } catch (error) {
    return errorResponse(error);
  }
}
