import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * 088_vote_deadline.sql — the "voting closes soon" push, claimed and sent
 * from `/api/cron/vote-deadline`. Event-level, one-shot claim (mirrors
 * `claim_event_reminder`'s shape, not the per-user `event_reminder_state`
 * table `listAndClaimDueReminders` uses), since this is a single courtesy
 * nudge per Jio rather than a per-recipient configurable lead time.
 */

beforeEach(() => {
  resetDemoStore();
});

/** `vote_end_at` lands exactly `minutesFromNow` minutes out, given `offsetMinutes`. */
function scheduledAtForDeadlineIn(
  minutesFromNow: number,
  offsetMinutes: number
): string {
  return new Date(
    Date.now() + (minutesFromNow + offsetMinutes) * 60_000
  ).toISOString();
}

async function makeEvent(
  minutesUntilDeadline: number,
  offsetMinutes: number | null = 60,
  inviteeIds: string[] = [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]
) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    scheduledAtForDeadlineIn(minutesUntilDeadline, offsetMinutes ?? 0),
    DEFAULT_OFFICE.id,
    ["demo-place-01"],
    null,
    inviteeIds,
    false,
    null,
    offsetMinutes
  );
}

describe("listAndClaimVoteDeadlineReminders", () => {
  it("claims an event whose deadline falls within the lookahead window", async () => {
    const event = await makeEvent(30);

    const due = await demoRepo.listAndClaimVoteDeadlineReminders(60);
    expect(due.map((d) => d.eventId)).toEqual([event.id]);
  });

  it("resolves only pending participants — not the host (voted), not a declined invitee", async () => {
    const event = await makeEvent(30);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "no");
    // DEMO_TEAMMATE_A never responds at all — still pending.

    const due = await demoRepo.listAndClaimVoteDeadlineReminders(60);
    expect(due[0].pendingUserIds).toEqual([DEMO_TEAMMATE_A]);
  });

  it("does not re-fire on a second sweep — one-shot per event", async () => {
    await makeEvent(30);

    const first = await demoRepo.listAndClaimVoteDeadlineReminders(60);
    const second = await demoRepo.listAndClaimVoteDeadlineReminders(60);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("does not claim a deadline further out than the lookahead window", async () => {
    await makeEvent(120);

    expect(await demoRepo.listAndClaimVoteDeadlineReminders(60)).toEqual([]);
  });

  it("does not claim a deadline that has already passed", async () => {
    await makeEvent(-5);

    expect(await demoRepo.listAndClaimVoteDeadlineReminders(60)).toEqual([]);
  });

  it("does not claim an event with no deadline set", async () => {
    await makeEvent(30, null);

    expect(await demoRepo.listAndClaimVoteDeadlineReminders(60)).toEqual([]);
  });

  it("does not claim a still-polling Flexi Jio", async () => {
    await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Flexi lunch",
      DEFAULT_OFFICE.id,
      ["2027-06-05", "2027-06-06"],
      null,
      [DEMO_TEAMMATE_A],
      false,
      "12:00",
      null,
      60
    );

    expect(await demoRepo.listAndClaimVoteDeadlineReminders(60)).toEqual([]);
  });

  it("can fire again after the host pushes an already-claimed deadline further out", async () => {
    const event = await makeEvent(30);
    await demoRepo.listAndClaimVoteDeadlineReminders(60);
    expect(await demoRepo.listAndClaimVoteDeadlineReminders(60)).toEqual([]);

    // Moves the deadline to 30 minutes from *now* again, well into the
    // future relative to the original — same shape as a host genuinely
    // extending it, not just re-reading the same moment.
    await demoRepo.setVoteDeadlineOffset(event.id, DEMO_USER_ID, 1);
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.vote_end_at).not.toBeNull();

    const due = await demoRepo.listAndClaimVoteDeadlineReminders(120);
    expect(due.map((d) => d.eventId)).toContain(event.id);
  });
});
