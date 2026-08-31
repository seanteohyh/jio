import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, notFound, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { redactHiddenVotes } from "@/lib/voting";
import { qualifiesForDecidedCelebration } from "@/lib/decidedCelebration";

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

    // UX review log #25 — the decided-Jio celebration, distinct from the
    // everyday "Decided" card. Generalised from a one-time account-wide
    // flag (migration 067) to one per (user, event): every decided Jio a
    // viewer voted on gets its own celebration, gated on the lunch itself
    // still being ahead of it. Fires the next time this account loads a
    // qualifying Jio's page while it hasn't seen that one's celebration
    // yet — not just live at the moment of closing (most closes happen
    // while nobody's watching: auto-close, or the host closing it) — so
    // this check runs on every load, not only on a state transition.
    // Stamped immediately once it qualifies, right here, so it can never
    // fire twice even across a rapid double-load. No longer also requires
    // an RSVP — see qualifiesForDecidedCelebration's own comment for why.
    const alreadySeenCelebration = await repo.hasSeenDecidedCelebration(
      user.id,
      id
    );
    const decidedCelebration = qualifiesForDecidedCelebration({
      alreadySeen: alreadySeenCelebration,
      eventStatus: event.status,
      isUpcoming: new Date(event.scheduled_at).getTime() > Date.now(),
      myVoteCount: myVote.length,
    });
    if (decidedCelebration) {
      await repo.markDecidedCelebrationShown(user.id, id);
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
        decidedCelebration,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * CHANGES_20260819c.md §1/§2 — host-only corrections, sharing one route since
 * they live on the same page: "Change date & time" (any time except once
 * cancelled), "Where did you actually go?" (once closed only), and toggling
 * a Jio's hidden-vote setting after the fact (`hide_votes` — see
 * `setHideVotes`'s own doc comment in src/lib/data/index.ts). Any of the
 * three may be sent alone or together.
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
      hide_votes?: boolean;
    }>(request);
    if (!body) return badRequest("Expected a JSON body");
    if (
      !body.scheduled_at &&
      !body.winner_place_id &&
      typeof body.hide_votes !== "boolean"
    ) {
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
    if (typeof body.hide_votes === "boolean") {
      await repo.setHideVotes(id, user.id, body.hide_votes);
    }

    const event = await repo.getEvent(id);
    if (!event) return notFound("That Jio does not exist");
    return json({ event: redactHiddenVotes(event) });
  } catch (error) {
    return errorResponse(error);
  }
}
