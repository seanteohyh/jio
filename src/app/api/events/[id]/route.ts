import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, notFound, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { qualifiesForFirstDecidedCelebration } from "@/lib/firstDecidedCelebration";

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

    // Computed from the true event before redaction — a voter still sees
    // their own submitted ranking confirmed even while the aggregate is
    // hidden from everyone, themselves included (see redactHiddenVotes).
    const myVote = event.votes
      .filter((v) => v.user_id === user.id)
      .sort((a, b) => a.rank - b.rank)
      .map((v) => v.place_id);

    const myRsvp =
      event.rsvps.find((r) => r.user_id === user.id)?.response ?? null;

    // CHANGES_20260821_combined2.md §3D — the one-time "first decided Jio"
    // celebration, distinct from the everyday "Decided" card. Fires the
    // next time this account loads *any* qualifying decided Jio's page
    // while the profile flag is still null — not just live at the moment
    // of closing (most closes happen while nobody's watching: auto-close,
    // or the host closing it) — so this check runs on every load, not only
    // on a state transition. Stamped immediately once it qualifies, right
    // here, so it can never fire twice even across a rapid double-load.
    const profile = await repo.getProfile(user.id);
    const firstDecidedCelebration = qualifiesForFirstDecidedCelebration({
      alreadyShown: Boolean(profile?.first_decided_celebration_shown_at),
      eventStatus: event.status,
      myRsvp,
      myVoteCount: myVote.length,
    });
    if (firstDecidedCelebration) {
      await repo.markFirstDecidedCelebrationShown(user.id);
    }

    // CHANGES_20260821c.md §1 — only fetched for someone confirmed going,
    // since that's the only case the "starting soon" reminder card ever
    // renders for. Two extra reads (prefs, this event's override) rather
    // than folding into `getEvent` itself, since every other viewer of
    // every other Jio would otherwise pay for a lookup they never use.
    let reminder: {
      enabled: boolean;
      defaultLeadMinutes: number;
      overrideLeadMinutes: number | null;
    } | null = null;
    if (myRsvp === "yes") {
      const [prefs, overrideLeadMinutes] = await Promise.all([
        repo.getUserPrefs(user.id),
        repo.getEventReminderOverride(id, user.id),
      ]);
      reminder = {
        enabled: prefs?.reminders_enabled ?? true,
        defaultLeadMinutes: prefs?.reminder_lead_minutes ?? 30,
        overrideLeadMinutes,
      };
    }

    return json({
      event: redactHiddenVotes(event),
      viewer: {
        id: user.id,
        isHost: event.host_id === user.id,
        canAddOptions: canAddOptions && event.status === "open",
        myVote,
        myRsvp,
        reminder,
        firstDecidedCelebration,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * CHANGES_20260819c.md §1/§2 — host-only corrections, sharing one route since
 * they live on the same page: "Change date & time" (any time except once
 * cancelled) and "Where did you actually go?" (once closed only). Either
 * field may be sent alone or both together.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const body = await readJson<{
      scheduled_at?: string;
      winner_place_id?: string;
    }>(request);
    if (!body) return badRequest("Expected a JSON body");
    if (!body.scheduled_at && !body.winner_place_id) {
      return badRequest("Nothing to update");
    }

    if (body.scheduled_at) {
      const when = new Date(body.scheduled_at);
      if (Number.isNaN(when.getTime())) {
        return badRequest("That does not look like a valid date and time");
      }
      await repo.rescheduleEvent(id, user.id, when.toISOString());
    }
    if (body.winner_place_id) {
      await repo.editEventWinner(id, user.id, body.winner_place_id);
    }

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");
    return json({ event: redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
