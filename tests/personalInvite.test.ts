import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

const STRANGER = "00000000-0000-0000-0000-0000000stranger";

/**
 * CHANGES_20260818.md §3 / docs/user-discovery.md §4.3 — a personal invite
 * link. Same shape as recovery links (`accountMerge.test.ts`'s "recovery
 * links" block), same things worth guarding: only the account owner or an
 * admin can mint one, regenerating retires the previous token, and
 * resolving returns only the minimum needed to render the page.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("personal invite links", () => {
  it("lets a user generate a link for their own account", async () => {
    const token = await demoRepo.generatePersonalInviteToken(
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_A
    );
    const resolved = await demoRepo.resolvePersonalInvite(token);
    expect(resolved?.user_id).toBe(DEMO_TEAMMATE_A);
    expect(resolved?.display_name).toBeTruthy();
  });

  it("lets an admin generate a link for someone else", async () => {
    const token = await demoRepo.generatePersonalInviteToken(
      DEMO_USER_ID,
      DEMO_TEAMMATE_B
    );
    expect((await demoRepo.resolvePersonalInvite(token))?.user_id).toBe(
      DEMO_TEAMMATE_B
    );
  });

  it("stops a non-admin generating a link for someone else", async () => {
    await expect(
      demoRepo.generatePersonalInviteToken(DEMO_TEAMMATE_A, DEMO_TEAMMATE_B)
    ).rejects.toThrow(/only get a personal invite link for your own account/i);
  });

  it("rejects generating a link for an account that does not exist", async () => {
    await expect(
      demoRepo.generatePersonalInviteToken(STRANGER, STRANGER)
    ).rejects.toThrow(/does not exist/i);
  });

  it("resolves an unknown token to null", async () => {
    expect(await demoRepo.resolvePersonalInvite("no-such-token")).toBeNull();
  });

  it("retires the previous token when a new one is generated", async () => {
    const first = await demoRepo.generatePersonalInviteToken(
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_A
    );
    const second = await demoRepo.generatePersonalInviteToken(
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_A
    );

    expect(await demoRepo.resolvePersonalInvite(first)).toBeNull();
    expect((await demoRepo.resolvePersonalInvite(second))?.user_id).toBe(
      DEMO_TEAMMATE_A
    );
  });
});
