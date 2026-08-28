import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";
import { qualifiesForFirstDecidedCelebration } from "@/lib/firstDecidedCelebration";

const STRANGER = "00000000-0000-0000-0000-0000000stranger";
const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

describe("qualifiesForFirstDecidedCelebration", () => {
  it("qualifies for a closed Jio the viewer RSVP'd and voted on", () => {
    expect(
      qualifiesForFirstDecidedCelebration({
        alreadyShown: false,
        eventStatus: "closed",
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(true);
  });

  it("any RSVP answer counts, not just yes", () => {
    for (const myRsvp of ["yes", "maybe", "no"] as const) {
      expect(
        qualifiesForFirstDecidedCelebration({
          alreadyShown: false,
          eventStatus: "closed",
          myRsvp,
          myVoteCount: 1,
        })
      ).toBe(true);
    }
  });

  it("never fires again once already shown", () => {
    expect(
      qualifiesForFirstDecidedCelebration({
        alreadyShown: true,
        eventStatus: "closed",
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire for a still-open Jio", () => {
    expect(
      qualifiesForFirstDecidedCelebration({
        alreadyShown: false,
        eventStatus: "open",
        myRsvp: "yes",
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire without an RSVP", () => {
    expect(
      qualifiesForFirstDecidedCelebration({
        alreadyShown: false,
        eventStatus: "closed",
        myRsvp: null,
        myVoteCount: 1,
      })
    ).toBe(false);
  });

  it("does not fire without a cast vote", () => {
    expect(
      qualifiesForFirstDecidedCelebration({
        alreadyShown: false,
        eventStatus: "closed",
        myRsvp: "yes",
        myVoteCount: 0,
      })
    ).toBe(false);
  });
});

async function makeEvent() {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    []
  );
}

describe("markFirstDecidedCelebrationShown", () => {
  it("stamps the profile the first time it's called", async () => {
    expect(
      (await demoRepo.getProfile(DEMO_USER_ID))
        ?.first_decided_celebration_shown_at
    ).toBeFalsy();

    await demoRepo.markFirstDecidedCelebrationShown(DEMO_USER_ID);

    expect(
      (await demoRepo.getProfile(DEMO_USER_ID))
        ?.first_decided_celebration_shown_at
    ).toBeTruthy();
  });

  it("is idempotent — a second call keeps the original timestamp", async () => {
    await demoRepo.markFirstDecidedCelebrationShown(DEMO_USER_ID);
    const first = (await demoRepo.getProfile(DEMO_USER_ID))
      ?.first_decided_celebration_shown_at;

    await demoRepo.markFirstDecidedCelebrationShown(DEMO_USER_ID);
    const second = (await demoRepo.getProfile(DEMO_USER_ID))
      ?.first_decided_celebration_shown_at;

    expect(second).toBe(first);
  });

  it("is a no-op for an account with no profile row", async () => {
    await expect(
      demoRepo.markFirstDecidedCelebrationShown(STRANGER)
    ).resolves.not.toThrow();
    expect(await demoRepo.getProfile(STRANGER)).toBeNull();
  });
});

describe("end to end: the API route's condition, wired through a real close", () => {
  it("qualifies once the viewer has RSVP'd, voted, and the Jio has closed", async () => {
    const event = await makeEvent();
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-02",
      "demo-place-01",
    ]);
    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    const profile = await demoRepo.getProfile(DEMO_USER_ID);
    const myRsvp =
      closed.status === "closed"
        ? (await demoRepo.getEvent(event.id))?.rsvps.find(
            (r) => r.user_id === DEMO_USER_ID
          )?.response ?? null
        : null;
    const myVoteCount =
      (await demoRepo.getEvent(event.id))?.votes.filter(
        (v) => v.user_id === DEMO_USER_ID
      ).length ?? 0;

    expect(
      qualifiesForFirstDecidedCelebration({
        alreadyShown: Boolean(profile?.first_decided_celebration_shown_at),
        eventStatus: closed.status,
        myRsvp,
        myVoteCount,
      })
    ).toBe(true);
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
      qualifiesForFirstDecidedCelebration({
        alreadyShown: false,
        eventStatus: closed.status,
        myRsvp,
        myVoteCount,
      })
    ).toBe(false);
  });
});
