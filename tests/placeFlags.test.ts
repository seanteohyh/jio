import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * Flag Inaccurate Places, reconciled onto the existing admins-table
 * moderation system (022_place_flags.sql) rather than a new profiles.is_admin
 * column. Worth guarding: repeat flags batch into one resolution, the place
 * stays visible while a flag is pending, and only DEMO_USER_ID (the demo
 * "admin") can resolve.
 */

const PLACE_ID = "demo-place-05";

beforeEach(() => {
  resetDemoStore();
});

describe("place flags", () => {
  it("flagging a place sets has_pending_flag", async () => {
    let place = await demoRepo.getPlace(PLACE_ID);
    expect(place?.has_pending_flag).toBe(false);

    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "wrong_info", "Address is off");

    place = await demoRepo.getPlace(PLACE_ID);
    expect(place?.has_pending_flag).toBe(true);
    // Flagging is a low-stakes report — the place stays fully active.
    expect(place?.status).toBe("active");
  });

  it("allows repeat flags from different people, all pending", async () => {
    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "closed");
    await demoRepo.flagPlace(DEMO_TEAMMATE_B, PLACE_ID, "duplicate");

    const pending = await demoRepo.listPendingFlags();
    const forPlace = pending.filter((f) => f.place_id === PLACE_ID);
    expect(forPlace).toHaveLength(2);
  });

  it("a non-admin cannot resolve a flag", async () => {
    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "closed");

    await expect(
      demoRepo.resolvePlaceFlags(DEMO_TEAMMATE_B, PLACE_ID, "dismissed")
    ).rejects.toThrow(/admin/i);
  });

  it("resolving with 'dismissed' clears has_pending_flag without touching status", async () => {
    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "closed");
    await demoRepo.resolvePlaceFlags(DEMO_USER_ID, PLACE_ID, "dismissed");

    const place = await demoRepo.getPlace(PLACE_ID);
    expect(place?.has_pending_flag).toBe(false);
    expect(place?.status).toBe("active");
  });

  it("resolving one place resolves every pending flag on it in one action", async () => {
    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "closed");
    await demoRepo.flagPlace(DEMO_TEAMMATE_B, PLACE_ID, "duplicate");

    await demoRepo.resolvePlaceFlags(DEMO_USER_ID, PLACE_ID, "edited");

    const pending = await demoRepo.listPendingFlags();
    expect(pending.filter((f) => f.place_id === PLACE_ID)).toHaveLength(0);

    const mine = await demoRepo.listMyFlags(DEMO_TEAMMATE_A);
    expect(mine[0].status).toBe("resolved");
    expect(mine[0].resolution).toBe("edited");
  });

  it("resolving with 'blocked' requires a reason and blocks the place", async () => {
    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "inappropriate");

    await expect(
      demoRepo.resolvePlaceFlags(DEMO_USER_ID, PLACE_ID, "blocked")
    ).rejects.toThrow(/reason/i);

    await demoRepo.resolvePlaceFlags(
      DEMO_USER_ID,
      PLACE_ID,
      "blocked",
      "Confirmed inappropriate"
    );

    const place = await demoRepo.getPlace(PLACE_ID);
    expect(place?.status).toBe("blocked");
    expect(place?.has_pending_flag).toBe(false);

    const log = await demoRepo.listModerationLog();
    const entry = log.find((l) => l.place_id === PLACE_ID);
    expect(entry?.action).toBe("block");
    expect(entry?.reason).toBe("Confirmed inappropriate");
  });

  it("refuses to resolve a place with no pending flags", async () => {
    await expect(
      demoRepo.resolvePlaceFlags(DEMO_USER_ID, PLACE_ID, "dismissed")
    ).rejects.toThrow(/pending/i);
  });

  it("a flagger sees their own report in My Reports", async () => {
    await demoRepo.flagPlace(DEMO_TEAMMATE_A, PLACE_ID, "other", "Looks fishy");

    const mine = await demoRepo.listMyFlags(DEMO_TEAMMATE_A);
    expect(mine).toHaveLength(1);
    expect(mine[0].place_name).toBeTruthy();
    expect(mine[0].comment).toBe("Looks fishy");

    const someoneElse = await demoRepo.listMyFlags(DEMO_TEAMMATE_B);
    expect(someoneElse).toHaveLength(0);
  });
});
