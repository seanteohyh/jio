import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";

/**
 * Admin allowlist, block/unblock, the moderation log, and the separate
 * needs_review confirm/dismiss path — the permission rules from today's
 * change log, exercised against the in-memory repo.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("isAdmin", () => {
  it("treats DEMO_USER_ID as admin by default", async () => {
    expect(await demoRepo.isAdmin(DEMO_USER_ID)).toBe(true);
  });

  it("treats every other demo teammate as a non-admin", async () => {
    expect(await demoRepo.isAdmin(DEMO_TEAMMATE_A)).toBe(false);
  });
});

describe("blockPlace", () => {
  it("refuses a blank reason", async () => {
    await expect(
      demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "   ")
    ).rejects.toThrow(/reason/i);
  });

  it("refuses a place that does not exist", async () => {
    await expect(
      demoRepo.blockPlace(DEMO_USER_ID, "no-such-place", "fake")
    ).rejects.toThrow();
  });

  it("lets the place's own creator block it", async () => {
    // Every seeded place is created_by DEMO_USER_ID.
    const place = await demoRepo.blockPlace(
      DEMO_USER_ID,
      "demo-place-01",
      "Duplicate entry"
    );
    expect(place.status).toBe("blocked");
  });

  it("refuses a non-creator, non-admin user", async () => {
    await expect(
      demoRepo.blockPlace(DEMO_TEAMMATE_A, "demo-place-01", "Not mine to remove")
    ).rejects.toThrow(/creator|admin/i);
  });

  it("lets an admin block a place they did not create", async () => {
    const created = await demoRepo.createPlace({
      name: "Someone Else's Place",
      address: null,
      lat: 1.3,
      lng: 103.85,
      cuisine: [],
      budget_tier: 2,
      osm_id: null,
      source: "manual",
      status: "active",
      best_dishes: [],
      notes: null,
      created_by: DEMO_TEAMMATE_A,
    });

    const place = await demoRepo.blockPlace(
      DEMO_USER_ID, // the admin, not the creator
      created.id,
      "Admin cleanup"
    );
    expect(place.status).toBe("blocked");
  });

  it("records a block in the moderation log", async () => {
    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "Permanently closed");
    const log = await demoRepo.listModerationLog();

    const entry = log.find((e) => e.place_id === "demo-place-01");
    expect(entry).toBeDefined();
    expect(entry?.action).toBe("block");
    expect(entry?.reason).toBe("Permanently closed");
    expect(entry?.actor_id).toBe(DEMO_USER_ID);
    expect(entry?.place_name).toBeTruthy();
    expect(entry?.actor_display_name).toBeTruthy();
  });
});

describe("unblockPlace", () => {
  it("refuses a non-admin", async () => {
    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "Testing");
    await expect(
      demoRepo.unblockPlace(DEMO_TEAMMATE_A, "demo-place-01")
    ).rejects.toThrow(/admin/i);
  });

  it("refuses a place that is not currently blocked", async () => {
    await expect(
      demoRepo.unblockPlace(DEMO_USER_ID, "demo-place-01")
    ).rejects.toThrow(/not currently blocked/i);
  });

  it("lets an admin restore a blocked place", async () => {
    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "Testing");
    const place = await demoRepo.unblockPlace(DEMO_USER_ID, "demo-place-01");
    expect(place.status).toBe("active");
  });

  it("records an unblock in the moderation log, newest first", async () => {
    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "Testing");
    await demoRepo.unblockPlace(DEMO_USER_ID, "demo-place-01");

    const log = await demoRepo.listModerationLog();
    expect(log[0].action).toBe("unblock");
    expect(log[0].reason ?? null).toBeNull();
    expect(log[1].action).toBe("block");
  });
});

describe("listModerationLog", () => {
  it("respects the limit", async () => {
    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "one");
    await demoRepo.unblockPlace(DEMO_USER_ID, "demo-place-01");
    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "two");

    const log = await demoRepo.listModerationLog(1);
    expect(log).toHaveLength(1);
    expect(log[0].reason).toBe("two");
  });
});

describe("reviewPlace", () => {
  it("refuses a place that is not needs_review", async () => {
    await expect(
      demoRepo.reviewPlace(DEMO_TEAMMATE_A, "demo-place-01", true)
    ).rejects.toThrow(/waiting for review/i);
  });

  it("lets any signed-in user approve a needs_review place, no admin required", async () => {
    const place = await demoRepo.reviewPlace(
      DEMO_TEAMMATE_A,
      "demo-place-99",
      true
    );
    expect(place.status).toBe("active");
  });

  it("lets any signed-in user reject a needs_review place into blocked", async () => {
    const place = await demoRepo.reviewPlace(
      DEMO_TEAMMATE_A,
      "demo-place-99",
      false
    );
    expect(place.status).toBe("blocked");
  });

  it("does not write to the moderation log — review is a lighter, separate path", async () => {
    await demoRepo.reviewPlace(DEMO_TEAMMATE_A, "demo-place-99", false);
    const log = await demoRepo.listModerationLog();
    expect(log.find((e) => e.place_id === "demo-place-99")).toBeUndefined();
  });

  it("a rejected needs_review place can still be recovered by an admin via unblock", async () => {
    await demoRepo.reviewPlace(DEMO_TEAMMATE_A, "demo-place-99", false);
    const place = await demoRepo.unblockPlace(DEMO_USER_ID, "demo-place-99");
    expect(place.status).toBe("active");
  });
});
