import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string; participantId: string }> };

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
 * breakdown row. Works identically for a registered participant or a
 * guest — both are just a `bill_split_participants` row.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id, participantId } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<ParticipantBody>(request);
    if (!body || (body.phone_number === undefined && body.paid === undefined)) {
      return badRequest("Nothing to update");
    }

    let split;
    if (body.phone_number !== undefined) {
      split = await repo.setSplitParticipantPhone(id, user.id, participantId, body.phone_number);
    }
    if (body.paid !== undefined) {
      split = await repo.setSplitPaid(id, user.id, participantId, body.paid);
    }

    return json({ split });
  } catch (error) {
    return errorResponse(error);
  }
}
