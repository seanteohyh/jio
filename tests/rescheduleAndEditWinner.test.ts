import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";

/**
 * CHANGES_20260819c.md §1/§2 — host-only corrections available after the
 * fact: moving a Jio's date/time (any time short of cancelled), and once
 * closed, correcting which place it actually ended up at. Also covers
 * reopenEvent, a third correction in the same family: undoing a close
 * entirely and putting a Jio back into voting.
 */

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

async function makeEvent() {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01"],
    null,
    []
  );
}

describe("rescheduleEvent", () => {
  it("lets the host move an open Jio's date/time", async () => {
    const event = await makeEvent();
    const newTime = new Date(Date.now() + 2 * 86400000).toISOString();
    const updated = await demoRepo.rescheduleEvent(
      event.id,
      DEMO_USER_ID,
      newTime
    );
    expect(updated.scheduled_at).toBe(newTime);
  });

  it("still lets the host move it after it's closed", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    const newTime = new Date(Date.now() + 2 * 86400000).toISOString();
    const updated = await demoRepo.rescheduleEvent(
      event.id,
      DEMO_USER_ID,
      newTime
    );
    expect(updated.status).toBe("closed");
    expect(updated.scheduled_at).toBe(newTime);
  });

  it("refuses once the Jio is cancelled", async () => {
    const event = await makeEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);
    await expect(
      demoRepo.rescheduleEvent(
        event.id,
        DEMO_USER_ID,
        new Date(Date.now() + 2 * 86400000).toISOString()
      )
    ).rejects.toThrow();
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.rescheduleEvent(
        event.id,
        DEMO_TEAMMATE_A,
        new Date(Date.now() + 2 * 86400000).toISOString()
      )
    ).rejects.toThrow();
  });

  it("finalizes a still-polling Flexi Jio's date, same as confirming a candidate", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Flexi lunch",
      DEFAULT_OFFICE.id,
      ["2027-01-04", "2027-01-05"],
      null,
      [],
      false
    );
    expect(event.date_phase).toBe("polling");

    const newTime = new Date("2027-01-06T12:00:00+08:00").toISOString();
    const updated = await demoRepo.rescheduleEvent(
      event.id,
      DEMO_USER_ID,
      newTime
    );
    expect(updated.date_phase).toBe("confirmed");
    expect(updated.scheduled_at).toBe(newTime);
  });
});

describe("editEventWinner", () => {
  it("lets the host correct a closed Jio's winner place", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    const updated = await demoRepo.editEventWinner(
      event.id,
      DEMO_USER_ID,
      "demo-place-02"
    );
    expect(updated.winner_place_id).toBe("demo-place-02");
    expect(updated.winner_place?.id).toBe("demo-place-02");
  });

  it("accepts a place that was never one of the voting options", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    const updated = await demoRepo.editEventWinner(
      event.id,
      DEMO_USER_ID,
      "demo-place-12"
    );
    expect(updated.winner_place_id).toBe("demo-place-12");
    expect(updated.winner_place?.id).toBe("demo-place-12");
  });

  it("refuses while the Jio is still open", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.editEventWinner(event.id, DEMO_USER_ID, "demo-place-02")
    ).rejects.toThrow();
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.editEventWinner(event.id, DEMO_TEAMMATE_A, "demo-place-02")
    ).rejects.toThrow();
  });

  it("refuses a place id that doesn't exist", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.editEventWinner(event.id, DEMO_USER_ID, "not-a-real-place")
    ).rejects.toThrow();
  });
});

describe("reopenEvent", () => {
  it("puts a closed Jio back into voting, clearing the winner", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    const reopened = await demoRepo.reopenEvent(event.id, DEMO_USER_ID);
    expect(reopened.status).toBe("open");
    expect(reopened.winner_place_id).toBeNull();
  });

  it("leaves existing ballots in place rather than clearing them", async () => {
    const event = await makeEvent();
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    const reopened = await demoRepo.reopenEvent(event.id, DEMO_USER_ID);
    expect(
      reopened.votes.some(
        (v) => v.user_id === DEMO_TEAMMATE_A && v.place_id === "demo-place-01"
      )
    ).toBe(true);
  });

  it("accepts a fresh or changed ballot once reopened", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await demoRepo.reopenEvent(event.id, DEMO_USER_ID);
    await expect(
      demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"])
    ).resolves.not.toThrow();
  });

  it("refuses while the Jio is still open", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.reopenEvent(event.id, DEMO_USER_ID)
    ).rejects.toThrow();
  });

  it("refuses once the Jio is cancelled", async () => {
    const event = await makeEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);
    await expect(
      demoRepo.reopenEvent(event.id, DEMO_USER_ID)
    ).rejects.toThrow();
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.reopenEvent(event.id, DEMO_TEAMMATE_A)
    ).rejects.toThrow();
  });

  it("refuses once the Jio's scheduled time has already passed", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Already happened",
      past,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      []
    );
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.reopenEvent(event.id, DEMO_USER_ID)
    ).rejects.toThrow();
  });
});
