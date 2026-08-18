import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, notFound, badRequest } from "@/lib/api";
import { config, featureGate } from "@/lib/config";
import { buildIcs, canAddToCalendar } from "@/lib/calendar";
import { eventInviteUrl } from "@/lib/shareUrl";

type Params = { params: Promise<{ id: string }> };

/**
 * `.ics` download for "Add to calendar" — CHANGES_20260818.md §5. Same
 * viewing model as `GET /api/events/[id]`: any signed-in user, not scoped
 * to invitees only (this app's whole trust model is "the team already
 * trusts each other," same reasoning as name-mode sign-in).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");
    if (!canAddToCalendar(event)) {
      return badRequest("This Jio's date isn't fixed yet");
    }

    const location =
      event.winner_place_name ?? event.winner_label ?? "Place TBD";
    const description = [
      event.host_name && `Hosted by ${event.host_name}`,
      `View this Jio: ${eventInviteUrl(event.invite_token)}`,
      `via ${config.appName}`,
    ]
      .filter(Boolean)
      .join("\n");

    const ics = buildIcs({
      id: event.id,
      title: event.title,
      scheduledAt: event.scheduled_at,
      location,
      description,
      url: eventInviteUrl(event.invite_token),
    });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.title.replace(/[^\w.-]+/g, "_")}.ics"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
