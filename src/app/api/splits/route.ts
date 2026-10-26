import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { formatCents } from "@/lib/expenses";
import { sendPushToUsers } from "@/lib/push";
import { logAction } from "@/lib/actions";
import { parseSplitInput, type SplitBody } from "@/lib/splits";

export async function GET() {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const splits = await repo.listSplits(user.id);
    return json({ splits });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const body = await readJson<SplitBody>(request);
    const input = parseSplitInput(body);
    if (typeof input === "string") return badRequest(input);

    const split = await repo.createSplit(user.id, input);
    await logAction(repo, user.id, "split.created", { splitId: split.id });

    // One push per participant, not a single batched send — each one owes
    // a different amount, so the message itself differs per person. Only
    // registered participants have anything to push to; guests are
    // silently skipped. Fires only on the first save; editing an existing
    // split doesn't re-notify (see PATCH on [id]) — this is the "you've
    // been added to a split" moment, not every subsequent correction.
    for (const participant of split.participants) {
      if (!participant.user_id) continue;
      if (participant.user_id === split.payer_user_id) continue;
      if (participant.owed_cents <= 0) continue;
      try {
        await sendPushToUsers(repo, [participant.user_id], {
          title: "You've been added to a bill split",
          body: `You owe ${formatCents(participant.owed_cents)} for "${split.title}"`,
          url: `/splits/${split.id}`,
        });
      } catch {
        // Logged inside sendPushToUsers already; one failed push must
        // never fail the save.
      }
    }

    return json({ split }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
