import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * 088_vote_deadline.sql — the deadline-based fallback close, additive to
 * (not a replacement for) `maybeAutoCloseEvent`'s own full-consensus check
 * above. Runs from a cron sweep, not write-triggered, so these tests
 * control the clock directly rather than driving it through RSVP/vote
 * writes the way the suite above does.
 */
describe("closeEventsPastVoteDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes an event past its deadline even with unresponded participants", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));

    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      new Date("2027-06-01T04:00:00Z").toISOString(), // 4h from "now"
      DEFAULT_OFFICE.id,
      ["demo-place-01", "demo-place-02"],
      null,
      [DEMO_TEAMMATE_A],
      false,
      null,
      180 // 3h before — deadline is 2027-06-01T01:00:00Z
    );
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    // DEMO_TEAMMATE_A never responds at all — would block the full-consensus
    // path indefinitely, which is exactly the gap this feature bounds.

    vi.setSystemTime(new Date("2027-06-01T01:00:01Z")); // just past the deadline

    const closed = await demoRepo.closeEventsPastVoteDeadline();
    expect(closed).toBe(1);
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.status).toBe("closed");
    expect(detail?.winner_place_id).toBe("demo-place-01");
  });

  it("does not close an event before its deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));

    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      new Date("2027-06-01T04:00:00Z").toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      180
    );

    vi.setSystemTime(new Date("2027-06-01T00:59:00Z")); // 1 min before deadline

    expect(await demoRepo.closeEventsPastVoteDeadline()).toBe(0);
    expect((await demoRepo.getEvent(event.id))?.status).toBe("open");
  });

  it("closes with no winner when nobody voted by the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));

    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      new Date("2027-06-01T04:00:00Z").toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      180
    );

    vi.setSystemTime(new Date("2027-06-01T02:00:00Z"));

    await demoRepo.closeEventsPastVoteDeadline();
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.status).toBe("closed");
    expect(detail?.winner_place_id).toBeNull();
  });

  it("does not touch an event with no deadline set", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));

    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      new Date("2027-06-01T04:00:00Z").toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      null
    );

    vi.setSystemTime(new Date("2027-07-01T00:00:00Z")); // well past

    expect(await demoRepo.closeEventsPastVoteDeadline()).toBe(0);
    expect((await demoRepo.getEvent(event.id))?.status).toBe("open");
  });

  it("does not close a still-polling Flexi Jio even with a stored offset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));

    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Flexi lunch",
      DEFAULT_OFFICE.id,
      ["2027-06-05", "2027-06-06"],
      null,
      [],
      false,
      "12:00",
      null,
      180
    );

    vi.setSystemTime(new Date("2027-07-01T00:00:00Z"));

    expect(await demoRepo.closeEventsPastVoteDeadline()).toBe(0);
    expect((await demoRepo.getEvent(event.id))?.status).toBe("open");
  });

  it("does not close an already-closed or cancelled event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));

    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      new Date("2027-06-01T04:00:00Z").toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      180
    );
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);

    vi.setSystemTime(new Date("2027-07-01T00:00:00Z"));

    expect(await demoRepo.closeEventsPastVoteDeadline()).toBe(0);
  });
});
