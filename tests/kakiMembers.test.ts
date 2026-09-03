import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260812.md §1 — adding an existing user to a Kaki directly,
 * without an invite link changing hands first. Decided: any current member
 * may add anyone, same trust level as the invite link itself.
 */

const STRANGER = "00000000-0000-0000-0000-0000000stranger";

beforeEach(() => {
  resetDemoStore();
});

describe("addKakiMember", () => {
  it("lets a current member add someone new", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");

    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_A, DEMO_USER_ID);

    const detail = await demoRepo.getKaki(kaki.id);
    expect(detail?.members.map((m) => m.user_id)).toContain(DEMO_TEAMMATE_A);
  });

  it("stops someone who isn't a member from adding anyone", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");

    await expect(
      demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_B, DEMO_TEAMMATE_A)
    ).rejects.toThrow(/only a member/i);
  });

  it("lets any member add someone, not just the creator", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_A, DEMO_USER_ID);

    // DEMO_TEAMMATE_A is now a member, not the creator — should still be
    // able to add someone else.
    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_B, DEMO_TEAMMATE_A);

    const detail = await demoRepo.getKaki(kaki.id);
    expect(detail?.members.map((m) => m.user_id)).toContain(DEMO_TEAMMATE_B);
  });

  it("does not duplicate someone already a member", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_A, DEMO_USER_ID);
    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_A, DEMO_USER_ID);

    const detail = await demoRepo.getKaki(kaki.id);
    expect(
      detail?.members.filter((m) => m.user_id === DEMO_TEAMMATE_A)
    ).toHaveLength(1);
  });

  it("rejects adding to a group that does not exist", async () => {
    await expect(
      demoRepo.addKakiMember("no-such-kaki", STRANGER, DEMO_USER_ID)
    ).rejects.toThrow(/not exist/i);
  });
});

describe("renameKaki", () => {
  it("lets the creator rename their own group", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");

    const renamed = await demoRepo.renameKaki(kaki.id, DEMO_USER_ID, "The 12:15 Crew");
    expect(renamed.name).toBe("The 12:15 Crew");

    const detail = await demoRepo.getKaki(kaki.id);
    expect(detail?.name).toBe("The 12:15 Crew");
  });

  it("lets any member rename it, not just the creator", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");
    await demoRepo.addKakiMember(kaki.id, DEMO_TEAMMATE_A, DEMO_USER_ID);

    const renamed = await demoRepo.renameKaki(
      kaki.id,
      DEMO_TEAMMATE_A,
      "Renamed by a member"
    );
    expect(renamed.name).toBe("Renamed by a member");
  });

  it("stops someone who isn't a member from renaming it", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Lunch crew");

    await expect(
      demoRepo.renameKaki(kaki.id, STRANGER, "Hijacked name")
    ).rejects.toThrow(/only a member/i);

    const detail = await demoRepo.getKaki(kaki.id);
    expect(detail?.name).toBe("Lunch crew");
  });

  it("rejects renaming a group that does not exist", async () => {
    await expect(
      demoRepo.renameKaki("no-such-kaki", DEMO_USER_ID, "New name")
    ).rejects.toThrow(/not exist/i);
  });
});
