import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";
import { qualifiesForDecidedCelebration } from "@/lib/decidedCelebration";

const STRANGER = "00000000-0000-0000-0000-0000000stranger";
const TOMORROW = new Date(Date.now() + 86400000).toISOString();
const YESTERDAY = new Date(Date.now() - 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

describe("qualifiesForDecidedCelebration", () => {
  it("qualifies for a closed, still-upcoming Jio the viewer RSVP'd and voted on", () => {
    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: "closed",
        isUpcoming: true,
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(true);
  });

  it("any RSVP answer counts, not just yes", () => {
    for (const myRsvp of ["yes", "maybe", "no"] as const) {
      expect(
        qualifiesForDecidedCelebration({
          alreadySeen: false,
          eventStatus: "closed",
          isUpcoming: true,
          myRsvp,
          myVoteCount: 1,
        })
      ).toBe(true);
    }
  });

  it("never fires again for a Jio it's already been seen on", () => {
    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: true,
        eventStatus: "closed",
        isUpcoming: true,
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire for a still-open Jio", () => {
    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: "open",
        isUpcoming: true,
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire once the Jio's lunch has already happened", () => {
    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: "closed",
        isUpcoming: false,
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire without an RSVP", () => {
    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: "closed",
        isUpcoming: true,
        myRsvp: null,
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire without a cast vote", () => {
    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: "closed",
        isUpcoming: true,
        myRsvp: "yes",
        myVoteCount: 0,
      })
    ).toBe(false);
  });
});

async function makeEvent(scheduledAt = TOMORROW) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    scheduledAt,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    []
  );
}

describe("hasSeenDecidedCelebration / markDecidedCelebrationShown", () => {
  it("reports false, then true after marking — one row per (user, event)", async () => {
    const event = await makeEvent();
    expect(
      await demoRepo.hasSeenDecidedCelebration(DEMO_USER_ID, event.id)
    ).toBe(false);

    await demoRepo.markDecidedCelebrationShown(DEMO_USER_ID, event.id);

    expect(
      await demoRepo.hasSeenDecidedCelebration(DEMO_USER_ID, event.id)
    ).toBe(true);
  });

  it("is idempotent — marking twice does not error or double-record", async () => {
    const event = await makeEvent();
    await demoRepo.markDecidedCelebrationShown(DEMO_USER_ID, event.id);
    await expect(
      demoRepo.markDecidedCelebrationShown(DEMO_USER_ID, event.id)
    ).resolves.not.toThrow();
    expect(
      await demoRepo.hasSeenDecidedCelebration(DEMO_USER_ID, event.id)
    ).toBe(true);
  });

  it("is scoped per event — seeing one Jio's celebration doesn't mark another", async () => {
    const eventA = await makeEvent();
    const eventB = await makeEvent();
    await demoRepo.markDecidedCelebrationShown(DEMO_USER_ID, eventA.id);

    expect(
      await demoRepo.hasSeenDecidedCelebration(DEMO_USER_ID, eventA.id)
    ).toBe(true);
    expect(
      await demoRepo.hasSeenDecidedCelebration(DEMO_USER_ID, eventB.id)
    ).toBe(false);
  });

  it("works for an account with no other footprint on this event", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.markDecidedCelebrationShown(STRANGER, event.id)
    ).resolves.not.toThrow();
    expect(await demoRepo.hasSeenDecidedCelebration(STRANGER, event.id)).toBe(
      true
    );
  });
});

describe("end to end: the API route's condition, wired through a real close", () => {
  it("qualifies once the viewer has RSVP'd, voted, the Jio has closed, and its lunch is still ahead", async () => {
    const event = await makeEvent(TOMORROW);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-02",
      "demo-place-01",
    ]);
    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);
    const detail = await demoRepo.getEvent(event.id);

    const myRsvp =
      detail?.rsvps.find((r) => r.user_id === DEMO_USER_ID)?.response ?? null;
    const myVoteCount =
      detail?.votes.filter((v) => v.user_id === DEMO_USER_ID).length ?? 0;
    const alreadySeen = await demoRepo.hasSeenDecidedCelebration(
      DEMO_USER_ID,
      event.id
    );

    expect(
      qualifiesForDecidedCelebration({
        alreadySeen,
        eventStatus: closed.status,
        isUpcoming: new Date(closed.scheduled_at).getTime() > Date.now(),
        myRsvp,
        myVoteCount,
      })
    ).toBe(true);
  });

  it("does not qualify once the Jio's own lunch date has already passed", async () => {
    const event = await makeEvent(YESTERDAY);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: closed.status,
        isUpcoming: new Date(closed.scheduled_at).getTime() > Date.now(),
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not qualify for someone who never voted, even if they RSVP'd", async () => {
    const event = await makeEvent();
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    const detail = await demoRepo.getEvent(event.id);
    const myRsvp =
      detail?.rsvps.find((r) => r.user_id === DEMO_TEAMMATE_A)?.response ??
      null;
    const myVoteCount =
      detail?.votes.filter((v) => v.user_id === DEMO_TEAMMATE_A).length ?? 0;

    expect(
      qualifiesForDecidedCelebration({
        alreadySeen: false,
        eventStatus: closed.status,
        isUpcoming: new Date(closed.scheduled_at).getTime() > Date.now(),
        myRsvp,
        myVoteCount,
      })
    ).toBe(false);
  });
});
