import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";

/**
 * Free-text notes the host fills in at creation ("parking is at the
 * back") — visible to every invitee, including the signed-out /e/[token]
 * preview (see publicEventPreview.test.ts for that half). Set once, no
 * edit path.
 */

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

describe("createEvent notes", () => {
  it("stores the host's notes", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      false,
      "Bring your own utensils"
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.notes).toBe("Bring your own utensils");
  });

  it("defaults to null when no notes are given", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"]
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.notes).toBeNull();
  });
});

describe("createFlexiEvent notes", () => {
  it("stores the host's notes", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Test lunch",
      DEFAULT_OFFICE.id,
      ["2026-09-10", "2026-09-11"],
      null,
      [],
      false,
      "12:00",
      "Dress code: smart casual"
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.notes).toBe("Dress code: smart casual");
  });

  it("defaults to null when no notes are given", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Test lunch",
      DEFAULT_OFFICE.id,
      ["2026-09-10", "2026-09-11"]
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.notes).toBeNull();
  });
});
