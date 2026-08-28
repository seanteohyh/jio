import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260821_combined.md Part 2 — a Jio auto-closes once every
 * participant has RSVP'd yes/no (not "maybe") and everyone who RSVP'd yes
 * has voted. Deliberately no host auto-confirm exception: the host RSVPs
 * like anyone else, same rule for everyone.
 */

beforeEach(() => {
  resetDemoStore();
});

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

async function makeEvent(inviteeIds: string[] = []) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    inviteeIds
  );
}

describe("maybeAutoCloseEvent", () => {
  it("does not close while a participant has not responded at all", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    // DEMO_TEAMMATE_A never responds.

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();
    expect((await demoRepo.getEvent(event.id))?.status).toBe("open");
  });

  it("does not close while a participant answered 'maybe'", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "maybe");

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();
  });

  it("does not close while a confirmed-yes participant has not voted", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    // DEMO_TEAMMATE_A confirmed but never voted.

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();
  });

  it("closes once every participant has responded and every yes has voted", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-01",
      "demo-place-02",
    ]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, [
      "demo-place-01",
      "demo-place-02",
    ]);
    // Declines — not required to vote.
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "no");

    const closed = await demoRepo.maybeAutoCloseEvent(event.id);
    expect(closed?.status).toBe("closed");
    expect(closed?.winner_place_id).toBe("demo-place-01");
  });

  it("host must RSVP too — no auto-confirm exception", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    // The invitee does everything right; the host never RSVPs at all.
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();

    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    expect((await demoRepo.maybeAutoCloseEvent(event.id))?.status).toBe(
      "closed"
    );
  });

  it("closes with no winner when everyone declines (nobody to vote)", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "no");
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "no");

    const closed = await demoRepo.maybeAutoCloseEvent(event.id);
    expect(closed?.status).toBe("closed");
    expect(closed?.winner_place_id).toBeNull();
  });

  it("does not close a still-polling Flexi Jio", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Flexi lunch",
      DEFAULT_OFFICE.id,
      ["2027-01-04", "2027-01-05"],
      null,
      []
    );
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();
  });

  it("no-ops on an already-closed event", async () => {
    const event = await makeEvent();
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.maybeAutoCloseEvent(event.id);
    expect((await demoRepo.getEvent(event.id))?.status).toBe("closed");

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();
  });

  it("no-ops on a cancelled event", async () => {
    const event = await makeEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);

    expect(await demoRepo.maybeAutoCloseEvent(event.id)).toBeNull();
  });

  it("returns null for an event that does not exist", async () => {
    expect(await demoRepo.maybeAutoCloseEvent("no-such-event")).toBeNull();
  });
});
