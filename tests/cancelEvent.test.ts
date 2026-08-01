import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";

/**
 * Calling off a Jio — CHANGES_20260801.md §9. `cancelled` is a new terminal
 * state, not a reuse of `closed`: an event that ends without a decision and
 * one the host called off on purpose need to read differently, or the
 * cancelling host's intent gets flattened into "nobody voted."
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

describe("cancelEvent", () => {
  it("lets the host cancel an open Jio", async () => {
    const event = await makeEvent();
    const cancelled = await demoRepo.cancelEvent(event.id, DEMO_USER_ID);
    expect(cancelled.status).toBe("cancelled");
  });

  it("refuses anyone but the host", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.cancelEvent(event.id, DEMO_TEAMMATE_A)
    ).rejects.toThrow();
  });

  it("refuses to cancel an already-cancelled Jio", async () => {
    const event = await makeEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);
    await expect(
      demoRepo.cancelEvent(event.id, DEMO_USER_ID)
    ).rejects.toThrow();
  });

  it("refuses to cancel a Jio that's already closed", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.cancelEvent(event.id, DEMO_USER_ID)
    ).rejects.toThrow();
  });

  it("stays findable afterward rather than disappearing", async () => {
    const event = await makeEvent();
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);

    const mine = await demoRepo.listEvents(DEMO_USER_ID);
    const found = mine.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.status).toBe("cancelled");
  });
});
