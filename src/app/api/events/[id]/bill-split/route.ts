import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { formatCents } from "@/lib/expenses";
import { sendPushToUsers } from "@/lib/push";
import { logAction } from "@/lib/actions";
import { parseBillSplitInput, type BillSplitBody } from "@/lib/billSplit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<BillSplitBody>(request);
    const input = parseBillSplitInput(body);
    if (typeof input === "string") return badRequest(input);

    const billSplit = await repo.createBillSplit(id, user.id, input);
    await logAction(repo, user.id, "jio.billSplit", { eventId: id });

    // One push per participant, not a single batched send — each one owes
    // a different amount, so the message itself differs per person. Fires
    // only on the first save; editing an existing split doesn't re-notify
    // (see PATCH on [billSplitId]) — this is the "you've been added to a
    // split" moment, not every subsequent correction to it.
    const event = await repo.getEvent(id);
    for (const participant of billSplit.participants) {
      if (participant.user_id === billSplit.payer_user_id) continue;
      if (participant.owed_cents <= 0) continue;
      try {
        await sendPushToUsers(repo, [participant.user_id], {
          title: "You've been added to a bill split",
          body: `You owe ${formatCents(participant.owed_cents)} for "${event?.title ?? "a Jio"}"`,
          url: `/events/${id}`,
        });
      } catch {
        // Logged inside sendPushToUsers already; one failed push must
        // never fail the save.
      }
    }

    return json({ billSplit }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
