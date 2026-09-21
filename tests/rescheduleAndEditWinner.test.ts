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

  it("recomputes vote_end_at from the current offset and the new time, not a stale delta", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      180 // 3h before
    );
    const newTime = new Date(Date.now() + 5 * 86400000).toISOString();
    const updated = await demoRepo.rescheduleEvent(
      event.id,
      DEMO_USER_ID,
      newTime
    );
    expect(updated.vote_end_at).toBe(
      new Date(new Date(newTime).getTime() - 180 * 60000).toISOString()
    );
  });

  it("leaves vote_end_at null after reschedule when no deadline is set", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      null
    );
    const updated = await demoRepo.rescheduleEvent(
      event.id,
      DEMO_USER_ID,
      new Date(Date.now() + 5 * 86400000).toISOString()
    );
    expect(updated.vote_end_at).toBeNull();
  });
});

describe("renameEvent", () => {
  it("lets the host rename an open Jio", async () => {
    const event = await makeEvent();
    const updated = await demoRepo.renameEvent(
      event.id,
      DEMO_USER_ID,
      "Renamed lunch"
    );
    expect(updated.title).toBe("Renamed lunch");
  });

  it("still lets the host rename it after it's closed", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    const updated = await demoRepo.renameEvent(
      event.id,
      DEMO_USER_ID,
      "Renamed after close"
    );
    expect(updated.status).toBe("closed");
    expect(updated.title).toBe("Renamed after close");
  });

  it("still lets the host rename it after it's cancelled", async () => {
    const event = await makeEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);
    const updated = await demoRepo.renameEvent(
      event.id,
      DEMO_USER_ID,
      "Renamed after cancel"
    );
    expect(updated.status).toBe("cancelled");
    expect(updated.title).toBe("Renamed after cancel");
  });

  it("trims whitespace", async () => {
    const event = await makeEvent();
    const updated = await demoRepo.renameEvent(
      event.id,
      DEMO_USER_ID,
      "  Padded  "
    );
    expect(updated.title).toBe("Padded");
  });

  it("refuses an empty title", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.renameEvent(event.id, DEMO_USER_ID, "   ")
    ).rejects.toThrow();
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.renameEvent(event.id, DEMO_TEAMMATE_A, "Hijacked name")
    ).rejects.toThrow();
  });
});

describe("setVoteDeadlineOffset", () => {
  it("lets the host set a deadline and computes vote_end_at from it", async () => {
    const event = await makeEvent();
    const updated = await demoRepo.setVoteDeadlineOffset(
      event.id,
      DEMO_USER_ID,
      120
    );
    expect(updated.vote_deadline_offset_minutes).toBe(120);
    expect(updated.vote_end_at).toBe(
      new Date(new Date(TOMORROW).getTime() - 120 * 60000).toISOString()
    );
  });

  it("clears the deadline back to null", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      null,
      180
    );
    const updated = await demoRepo.setVoteDeadlineOffset(
      event.id,
      DEMO_USER_ID,
      null
    );
    expect(updated.vote_deadline_offset_minutes).toBeNull();
    expect(updated.vote_end_at).toBeNull();
  });

  it("refuses once the Jio isn't open", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.setVoteDeadlineOffset(event.id, DEMO_USER_ID, 60)
    ).rejects.toThrow();
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.setVoteDeadlineOffset(event.id, DEMO_TEAMMATE_A, 60)
    ).rejects.toThrow();
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

  it("stamps winner_corrected_at once the winner is corrected", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    expect(
      (await demoRepo.getEvent(event.id))?.winner_corrected_at
    ).toBeFalsy();

    const updated = await demoRepo.editEventWinner(
      event.id,
      DEMO_USER_ID,
      "demo-place-02"
    );
    expect(updated.winner_corrected_at).toBeTruthy();
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

  it("clears winner_corrected_at from a prior correction on reopen", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await demoRepo.editEventWinner(event.id, DEMO_USER_ID, "demo-place-02");

    const reopened = await demoRepo.reopenEvent(event.id, DEMO_USER_ID);
    expect(reopened.winner_corrected_at).toBeFalsy();
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
