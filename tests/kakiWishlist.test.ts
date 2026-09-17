import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

const STRANGER = "00000000-0000-0000-0000-0000000stranger";

beforeEach(() => {
  resetDemoStore();
});

describe("kaki wishlist", () => {
  it("lets a member add a place, hydrated with the place record and adder's name", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");

    const entry = await demoRepo.addKakiWishlistEntry(
      kaki.id,
      DEMO_USER_ID,
      "demo-place-01"
    );

    expect(entry.place?.id).toBe("demo-place-01");
    expect(entry.added_by).toBe(DEMO_USER_ID);
    expect(entry.added_by_name).toBeTruthy();

    const list = await demoRepo.listKakiWishlist(kaki.id);
    expect(list.map((e) => e.id)).toContain(entry.id);
  });

  it("refuses someone who isn't a member", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");

    await expect(
      demoRepo.addKakiWishlistEntry(kaki.id, STRANGER, "demo-place-01")
    ).rejects.toThrow(/only a member/i);
  });

  it("refuses a duplicate add of the same place", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    await demoRepo.addKakiWishlistEntry(kaki.id, DEMO_USER_ID, "demo-place-01");

    await expect(
      demoRepo.addKakiWishlistEntry(kaki.id, DEMO_USER_ID, "demo-place-01")
    ).rejects.toThrow(/already/i);
  });

  it("lets any current member remove an entry, not just whoever added it", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_A, DEMO_USER_ID);
    const entry = await demoRepo.addKakiWishlistEntry(
      kaki.id,
      DEMO_USER_ID,
      "demo-place-01"
    );

    // DEMO_TEAMMATE_A didn't add it, but is a member — should still work,
    // same "any member is trusted" reasoning renameKaki already applies.
    await demoRepo.removeKakiWishlistEntry(kaki.id, DEMO_TEAMMATE_A, entry.id);

    const list = await demoRepo.listKakiWishlist(kaki.id);
    expect(list.map((e) => e.id)).not.toContain(entry.id);
  });

  it("refuses removal by someone who isn't a member", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    const entry = await demoRepo.addKakiWishlistEntry(
      kaki.id,
      DEMO_USER_ID,
      "demo-place-01"
    );

    await expect(
      demoRepo.removeKakiWishlistEntry(kaki.id, DEMO_TEAMMATE_B, entry.id)
    ).rejects.toThrow(/only a member/i);
  });

  it("is scoped per-Kaki — one group's list doesn't leak into another's", async () => {
    const kakiA = await demoRepo.createKaki(DEMO_USER_ID, "Crew A");
    const kakiB = await demoRepo.createKaki(DEMO_USER_ID, "Crew B");
    await demoRepo.addKakiWishlistEntry(kakiA.id, DEMO_USER_ID, "demo-place-01");

    const listB = await demoRepo.listKakiWishlist(kakiB.id);
    expect(listB).toHaveLength(0);
  });

  it("filters out an entry once its place is blocked, without deleting the row (confirmed: filter, don't prune)", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    await demoRepo.addKakiWishlistEntry(kaki.id, DEMO_USER_ID, "demo-place-01");

    await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-01", "test block");

    const list = await demoRepo.listKakiWishlist(kaki.id);
    expect(list.map((e) => e.place_id)).not.toContain("demo-place-01");

    // The row itself is still there, just filtered — proven by the unique
    // constraint still refusing a second add for the same place.
    await expect(
      demoRepo.addKakiWishlistEntry(kaki.id, DEMO_USER_ID, "demo-place-01")
    ).rejects.toThrow(/already/i);
  });
});
