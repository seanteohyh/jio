import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260807.md §4/§5 — the shared account-reassignment operation
 * behind both self-service name-claim and the admin merge tool.
 *
 * DEMO_USER_ID is the one admin in demo mode (see demoRepo.isAdmin), so it
 * doubles as "an admin" below wherever that's what's under test.
 */

const STRANGER = "00000000-0000-0000-0000-0000000stranger";
const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

describe("listDuplicateProfiles", () => {
  it("groups accounts sharing a case/whitespace-normalized name", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_A, "Mei Lin");
    await demoRepo.upsertProfile(DEMO_TEAMMATE_B, " mei lin ");

    const groups = await demoRepo.listDuplicateProfiles();
    const group = groups.find((g) => g.normalized_name === "mei lin");

    expect(group).toBeDefined();
    expect(group?.accounts.map((a) => a.user_id).sort()).toEqual(
      [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B].sort()
    );
  });

  it("does not report a name only one account uses", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_A, "Only One");

    const groups = await demoRepo.listDuplicateProfiles();
    expect(groups.find((g) => g.normalized_name === "only one")).toBeUndefined();
  });
});

describe("mergeUserAccounts — authorization", () => {
  it("lets a user merge another account into their own", async () => {
    await expect(
      demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B)
    ).resolves.toBeUndefined();
  });

  it("lets an admin merge two accounts that are neither their own", async () => {
    await expect(
      demoRepo.mergeUserAccounts(DEMO_USER_ID, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B)
    ).resolves.toBeUndefined();
  });

  it("stops a non-admin merging into someone else's account", async () => {
    await expect(
      demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_B, STRANGER)
    ).rejects.toThrow(/only merge another account into your own/i);
  });

  it("rejects merging an account into itself", async () => {
    await expect(
      demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_A)
    ).rejects.toThrow(/itself/i);
  });
});

describe("mergeUserAccounts — reassignment", () => {
  it("moves a hosted Jio to the surviving account", async () => {
    const event = await demoRepo.createEvent(
      DEMO_TEAMMATE_B,
      "Old account's Jio",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"]
    );

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.host_id).toBe(DEMO_TEAMMATE_A);
  });

  it("moves a vote that has no collision", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Vote merge test",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01", "demo-place-02"]
    );
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_B, ["demo-place-02"]);

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const detail = await demoRepo.getEvent(event.id);
    const survivorVotes = detail?.votes.filter((v) => v.user_id === DEMO_TEAMMATE_A);
    expect(survivorVotes).toHaveLength(1);
    expect(survivorVotes?.[0].place_id).toBe("demo-place-02");
  });

  it("drops the merged-in vote on a same-event, same-place collision", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Vote collision test",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"]
    );
    // Both accounts ranked the same, and only, option — merge should keep
    // the survivor's own vote rather than erroring on the duplicate PK.
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_B, ["demo-place-01"]);

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const detail = await demoRepo.getEvent(event.id);
    const survivorVotes = detail?.votes.filter((v) => v.user_id === DEMO_TEAMMATE_A);
    expect(survivorVotes).toHaveLength(1);
    expect(survivorVotes?.[0].place_id).toBe("demo-place-01");
    expect(detail?.votes.some((v) => v.user_id === DEMO_TEAMMATE_B)).toBe(false);
  });

  it("moves an RSVP that has no collision", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "RSVP merge test",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"]
    );
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "yes");

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const detail = await demoRepo.getEvent(event.id);
    expect(
      detail?.rsvps.find((r) => r.user_id === DEMO_TEAMMATE_A)?.response
    ).toBe("yes");
  });

  it("moves Kaki membership and ownership", async () => {
    const kaki = await demoRepo.createKaki(DEMO_TEAMMATE_B, "Old account's group");
    const otherKaki = await demoRepo.createKaki(DEMO_USER_ID, "Another group");
    await demoRepo.joinKaki(otherKaki.invite_token, DEMO_TEAMMATE_B);

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const owned = await demoRepo.getKaki(kaki.id);
    expect(owned?.created_by).toBe(DEMO_TEAMMATE_A);

    const memberOf = await demoRepo.listKakis(DEMO_TEAMMATE_A);
    expect(memberOf.map((k) => k.id)).toContain(otherKaki.id);
  });

  it("moves a wishlist save that has no collision", async () => {
    await demoRepo.toggleWishlist(DEMO_TEAMMATE_B, "demo-place-01");

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const wishlist = await demoRepo.listWishlist(DEMO_TEAMMATE_A);
    expect(wishlist.map((w) => w.place_id)).toContain("demo-place-01");
  });

  it("keeps the surviving account's own prefs over the merged-in account's", async () => {
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_A,
      cuisine_likes: ["Japanese"],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
    });
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_B,
      cuisine_likes: ["Korean"],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
    });

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const prefs = await demoRepo.getUserPrefs(DEMO_TEAMMATE_A);
    expect(prefs?.cuisine_likes).toEqual(["Japanese"]);
  });

  it("adopts the merged-in account's prefs when the survivor had none", async () => {
    // DEMO_TEAMMATE_A/B both come seeded with prefs — STRANGER doesn't,
    // which is the case this test needs.
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_B,
      cuisine_likes: ["Korean"],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
    });

    await demoRepo.mergeUserAccounts(STRANGER, STRANGER, DEMO_TEAMMATE_B);

    const prefs = await demoRepo.getUserPrefs(STRANGER);
    expect(prefs?.cuisine_likes).toEqual(["Korean"]);
  });

  it("retires the merged-in account's profile", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_B, "Old identity");

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const profile = await demoRepo.getProfile(DEMO_TEAMMATE_B);
    expect(profile).toBeNull();
  });

  it("carries the earlier signup date forward, regardless of which account survives", async () => {
    // CHANGES_20260812.md §5 — nameAuth always passes the freshly minted
    // session as keep, so the *older* account here is deliberately the
    // one being merged away, matching the real-world shape of the bug.
    await demoRepo.upsertProfile(DEMO_TEAMMATE_B, "Original signup");
    const original = await demoRepo.getProfile(DEMO_TEAMMATE_B);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await demoRepo.upsertProfile(DEMO_TEAMMATE_A, "Fresh re-login");

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    const survivor = await demoRepo.getProfile(DEMO_TEAMMATE_A);
    expect(survivor?.created_at).toBe(original?.created_at);
  });
});

describe("recovery links", () => {
  it("lets a user generate a link for their own account", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_A, "Has a link");
    const token = await demoRepo.generateRecoveryToken(
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_A
    );
    expect(await demoRepo.resolveRecoveryToken(token)).toBe(DEMO_TEAMMATE_A);
  });

  it("lets an admin generate a link for someone else", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_B, "Needs a link");
    const token = await demoRepo.generateRecoveryToken(
      DEMO_USER_ID,
      DEMO_TEAMMATE_B
    );
    expect(await demoRepo.resolveRecoveryToken(token)).toBe(DEMO_TEAMMATE_B);
  });

  it("stops a non-admin generating a link for someone else", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_B, "Not yours to link");
    await expect(
      demoRepo.generateRecoveryToken(DEMO_TEAMMATE_A, DEMO_TEAMMATE_B)
    ).rejects.toThrow(/only get a recovery link for your own account/i);
  });

  it("rejects generating a link for an account that does not exist", async () => {
    await expect(
      demoRepo.generateRecoveryToken(STRANGER, STRANGER)
    ).rejects.toThrow(/does not exist/i);
  });

  it("resolves an unknown token to null", async () => {
    expect(await demoRepo.resolveRecoveryToken("no-such-token")).toBeNull();
  });

  it("retires the previous token when a new one is generated", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_A, "Refreshed link");
    const first = await demoRepo.generateRecoveryToken(
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_A
    );
    const second = await demoRepo.generateRecoveryToken(
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_A
    );

    expect(await demoRepo.resolveRecoveryToken(first)).toBeNull();
    expect(await demoRepo.resolveRecoveryToken(second)).toBe(DEMO_TEAMMATE_A);
  });

  it("stops resolving once the account behind it has been merged away", async () => {
    await demoRepo.upsertProfile(DEMO_TEAMMATE_B, "About to be merged");
    const token = await demoRepo.generateRecoveryToken(
      DEMO_TEAMMATE_B,
      DEMO_TEAMMATE_B
    );

    await demoRepo.mergeUserAccounts(DEMO_TEAMMATE_A, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B);

    expect(await demoRepo.resolveRecoveryToken(token)).toBeNull();
  });
});

describe("listAdminIds", () => {
  // CHANGES_20260807c.md §3 item 5 — who a "possible duplicate" push goes to.
  it("returns the demo admin", async () => {
    const admins = await demoRepo.listAdminIds();
    expect(admins).toEqual([DEMO_USER_ID]);
  });
});
