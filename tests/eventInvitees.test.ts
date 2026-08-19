import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260819b.md — "host can add or remove users in the Jio, both
 * before and after confirmed." Adding already existed as an unused backend
 * path (`addInviteesToEvent`, no UI); removing is new end to end. Neither
 * checks `status` — a host closing (or even cancelling) a Jio doesn't stop
 * being able to say who's coming.
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
    ["demo-place-01", "demo-place-02"],
    null,
    []
  );
}

describe("addInviteesToEvent", () => {
  it("lets the host add someone after creation", async () => {
    const event = await makeEvent();
    await demoRepo.addInviteesToEvent(
      event.id,
      [DEMO_TEAMMATE_A],
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).toContain(DEMO_TEAMMATE_A);
  });

  it("still works after the Jio is closed", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await demoRepo.addInviteesToEvent(
      event.id,
      [DEMO_TEAMMATE_A],
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).toContain(DEMO_TEAMMATE_A);
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.addInviteesToEvent(event.id, [DEMO_TEAMMATE_B], DEMO_TEAMMATE_A)
    ).rejects.toThrow();
  });
});

describe("removeInviteeFromEvent", () => {
  async function makeInvitedEvent() {
    const event = await makeEvent();
    await demoRepo.addInviteesToEvent(
      event.id,
      [DEMO_TEAMMATE_A],
      DEMO_USER_ID
    );
    return event;
  }

  it("lets the host remove an invitee", async () => {
    const event = await makeInvitedEvent();
    await demoRepo.removeInviteeFromEvent(
      event.id,
      DEMO_TEAMMATE_A,
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).not.toContain(
      DEMO_TEAMMATE_A
    );
  });

  it("still works after the Jio is closed", async () => {
    const event = await makeInvitedEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await demoRepo.removeInviteeFromEvent(
      event.id,
      DEMO_TEAMMATE_A,
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).not.toContain(
      DEMO_TEAMMATE_A
    );
  });

  it("also works after the Jio is cancelled", async () => {
    const event = await makeInvitedEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);
    await demoRepo.removeInviteeFromEvent(
      event.id,
      DEMO_TEAMMATE_A,
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).not.toContain(
      DEMO_TEAMMATE_A
    );
  });

  it("refuses anyone but the host", async () => {
    const event = await makeInvitedEvent();
    await expect(
      demoRepo.removeInviteeFromEvent(
        event.id,
        DEMO_TEAMMATE_A,
        DEMO_TEAMMATE_B
      )
    ).rejects.toThrow();
  });

  it("refuses to remove the host", async () => {
    const event = await makeInvitedEvent();
    await expect(
      demoRepo.removeInviteeFromEvent(event.id, DEMO_USER_ID, DEMO_USER_ID)
    ).rejects.toThrow();
  });

  it("drops their RSVP so a removed person's response doesn't linger", async () => {
    const event = await makeInvitedEvent();
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");

    let detail = await demoRepo.getEvent(event.id);
    expect(detail?.rsvps.some((r) => r.user_id === DEMO_TEAMMATE_A)).toBe(
      true
    );

    await demoRepo.removeInviteeFromEvent(
      event.id,
      DEMO_TEAMMATE_A,
      DEMO_USER_ID
    );
    detail = await demoRepo.getEvent(event.id);
    expect(detail?.rsvps.some((r) => r.user_id === DEMO_TEAMMATE_A)).toBe(
      false
    );
  });

  it("drops their ballot so a removed person's votes don't skew the tally", async () => {
    const event = await makeInvitedEvent();
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);

    await demoRepo.removeInviteeFromEvent(
      event.id,
      DEMO_TEAMMATE_A,
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(
      detail?.votes?.some((v) => v.user_id === DEMO_TEAMMATE_A)
    ).toBe(false);
  });

  it("leaves what the removed person added (an option) alone", async () => {
    const event = await makeInvitedEvent();
    await demoRepo.addOptionToEvent(
      event.id,
      "demo-place-03",
      DEMO_TEAMMATE_A
    );

    await demoRepo.removeInviteeFromEvent(
      event.id,
      DEMO_TEAMMATE_A,
      DEMO_USER_ID
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(
      detail?.options.some((o) => o.place_id === "demo-place-03")
    ).toBe(true);
  });
});
