import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { parseBillSplitInput, type BillSplitBody } from "@/lib/billSplit";

type Params = { params: Promise<{ id: string; billSplitId: string }> };

/**
 * Re-saves an existing split with a fresh item list — same shape as
 * `POST` on the parent route. Deliberately does not re-send the
 * "you've been added" push (see that route's own comment); a correction
 * to an already-notified split doesn't need to re-notify everyone.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { billSplitId } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<BillSplitBody>(request);
    const input = parseBillSplitInput(body);
    if (typeof input === "string") return badRequest(input);

    const billSplit = await repo.updateBillSplit(billSplitId, user.id, input);
    return json({ billSplit });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { billSplitId } = await params;
    const repo = await getRepoAsync();

    await repo.deleteBillSplit(billSplitId, user.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
