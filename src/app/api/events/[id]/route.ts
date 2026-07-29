import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, notFound } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");

    // Whether this viewer may add options — the UI needs to know before it
    // renders the button, and the answer depends on kaki membership.
    let canAddOptions = event.host_id === user.id;
    if (!canAddOptions && event.kaki_id) {
      const kaki = await repo.getKaki(event.kaki_id);
      canAddOptions = Boolean(
        kaki?.members.some((m) => m.user_id === user.id)
      );
    }
    if (!canAddOptions) {
      canAddOptions = event.invitees.some((i) => i.user_id === user.id);
    }

    return json({
      event,
      viewer: {
        id: user.id,
        isHost: event.host_id === user.id,
        canAddOptions: canAddOptions && event.status === "open",
        myVote: event.votes
          .filter((v) => v.user_id === user.id)
          .sort((a, b) => a.rank - b.rank)
          .map((v) => v.place_id),
        myRsvp:
          event.rsvps.find((r) => r.user_id === user.id)?.response ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
