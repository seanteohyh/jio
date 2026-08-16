import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import {
  DEMO_KAKI_ID,
  DEMO_TEAMMATE_A,
  DEMO_TEAMMATE_B,
} from "@/lib/data/demoData";
import type { LobangTarget } from "@/types";

const toOne = (userId: string): LobangTarget => ({
  type: "users",
  userIds: [userId],
});

/**
 * Lobangs: a personalized recommendation sent to specific teammates, or to
 * every current member of a Kaki at once.
 *
 * The things worth guarding: a lobang is only ever visible to its sender and
 * its recipients (never a team-wide broadcast), a group send snapshots
 * membership at send time rather than resolving it dynamically later, the
 * sender never ends up as their own recipient, and the "personalized"
 * suggestions that back the composer never leak a recipient's *private*
 * visit history — only what they've already made public is fair game.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("lobangs", () => {
  it("is visible to sender and recipient, not to a third teammate", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      toOne(DEMO_USER_ID),
      "demo-place-12",
      "Try the hor fun"
    );

    const received = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    expect(received.map((l) => l.id)).toContain(lobang.id);

    const sent = await demoRepo.listLobangsSent(DEMO_TEAMMATE_A);
    expect(sent.map((l) => l.id)).toContain(lobang.id);

    const bystander = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_B);
    expect(bystander.map((l) => l.id)).not.toContain(lobang.id);
  });

  it("hydrates the place, both display names, and the note", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      toOne(DEMO_USER_ID),
      "demo-place-12",
      "Try the hor fun"
    );

    expect(lobang.place?.name).toBeTruthy();
    expect(lobang.from_display_name).toBeTruthy();
    expect(lobang.to_display_name).toBeTruthy();
    expect(lobang.note).toBe("Try the hor fun");
  });

  it("can only be marked seen by the recipient", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      toOne(DEMO_USER_ID),
      "demo-place-12"
    );

    // The sender trying to mark their own sent lobang "seen" should be a
    // no-op — that field means "the recipient looked at this".
    await demoRepo.markLobangSeen(DEMO_TEAMMATE_A, lobang.id);
    let [stillUnseen] = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    expect(stillUnseen.seen_at).toBeNull();

    await demoRepo.markLobangSeen(DEMO_USER_ID, lobang.id);
    [stillUnseen] = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    expect(stillUnseen.seen_at).not.toBeNull();
  });

  it("can be dismissed by either the sender or the recipient", async () => {
    const a = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      toOne(DEMO_USER_ID),
      "demo-place-12"
    );
    const b = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      toOne(DEMO_USER_ID),
      "demo-place-16"
    );

    await demoRepo.dismissLobang(DEMO_USER_ID, a.id); // recipient dismisses
    await demoRepo.dismissLobang(DEMO_TEAMMATE_A, b.id); // sender retracts

    const received = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    expect(received.map((l) => l.id)).not.toContain(a.id);
    expect(received.map((l) => l.id)).not.toContain(b.id);
  });

  it("never lets a stranger dismiss someone else's lobang", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      toOne(DEMO_USER_ID),
      "demo-place-12"
    );

    await demoRepo.dismissLobang(DEMO_TEAMMATE_B, lobang.id);

    const received = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    expect(received.map((l) => l.id)).toContain(lobang.id);
  });

  it("sends to every recipient in a multi-select individual send", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      { type: "users", userIds: [DEMO_USER_ID, DEMO_TEAMMATE_B] },
      "demo-place-12"
    );

    const forUser = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    const forTeammateB = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_B);
    expect(forUser.map((l) => l.id)).toContain(lobang.id);
    expect(forTeammateB.map((l) => l.id)).toContain(lobang.id);
  });

  it("group-sends to every current Kaki member except the sender", async () => {
    // DEMO_USER_ID, DEMO_TEAMMATE_A and DEMO_TEAMMATE_B are all members of
    // DEMO_KAKI_ID in the seed data.
    const lobang = await demoRepo.sendLobang(
      DEMO_USER_ID,
      { type: "kaki", kakiId: DEMO_KAKI_ID },
      "demo-place-12"
    );

    const forSelf = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    const forA = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_A);
    const forB = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_B);

    // The sender is never their own recipient, even though they're a member.
    expect(forSelf.map((l) => l.id)).not.toContain(lobang.id);
    expect(forA.map((l) => l.id)).toContain(lobang.id);
    expect(forB.map((l) => l.id)).toContain(lobang.id);

    const sent = await demoRepo.listLobangsSent(DEMO_USER_ID);
    const sentLobang = sent.find((l) => l.id === lobang.id);
    expect(sentLobang?.to_display_name).toBe("LazadaOne Lunch Kakis");
  });

  it("refuses a group send to a Kaki the sender isn't a member of", async () => {
    await expect(
      demoRepo.sendLobang(
        "some-stranger-id",
        { type: "kaki", kakiId: DEMO_KAKI_ID },
        "demo-place-12"
      )
    ).rejects.toThrow(/not allowed/i);
  });

  it("refuses a send with no recipients left after excluding the sender", async () => {
    await expect(
      demoRepo.sendLobang(
        DEMO_USER_ID,
        { type: "users", userIds: [DEMO_USER_ID] },
        "demo-place-12"
      )
    ).rejects.toThrow(/recipient/i);
  });

  it("dismissing a group send only removes the dismisser's own copy", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_USER_ID,
      { type: "kaki", kakiId: DEMO_KAKI_ID },
      "demo-place-12"
    );

    await demoRepo.dismissLobang(DEMO_TEAMMATE_A, lobang.id);

    const forA = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_A);
    const forB = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_B);
    expect(forA.map((l) => l.id)).not.toContain(lobang.id);
    expect(forB.map((l) => l.id)).toContain(lobang.id);
  });

  it("only draws suggestions from the friend's public visit history", async () => {
    // demo-place-07 was rated by DEMO_USER_ID two days ago but marked
    // private (see demoData.ts). If suggestPlacesForFriend ever leaked
    // private visits, the engine would treat it as recently visited and
    // apply the (negative) recency penalty. Kept private and unseen by the
    // engine, it should read as unexplored instead.
    const results = await demoRepo.suggestPlacesForFriend(DEMO_USER_ID, 50);
    const privatelyVisited = results.find((r) => r.place.id === "demo-place-07");

    expect(privatelyVisited).toBeDefined();
    expect(privatelyVisited!.breakdown.varietyBonus).toBeGreaterThan(0);
  });

  it("does still pick up on the friend's public visits", async () => {
    // demo-place-02 was rated publicly by DEMO_USER_ID (see demoData.ts),
    // so the engine should know about it and apply the recency penalty
    // rather than treating it as unexplored.
    const results = await demoRepo.suggestPlacesForFriend(DEMO_USER_ID, 50);
    const publiclyVisited = results.find((r) => r.place.id === "demo-place-02");

    expect(publiclyVisited).toBeDefined();
    expect(publiclyVisited!.breakdown.varietyBonus).toBeLessThanOrEqual(0);
  });

  // CHANGES_20260816.md §4 — "Share this lobang"'s third path: a public
  // send has no recipient rows at all, is resolved only through its own
  // token, and never appears in either the sender's or anyone's lists.
  describe("public sends", () => {
    it("creates no lobang_recipients rows and needs no recipient to succeed", async () => {
      const lobang = await demoRepo.sendLobang(
        DEMO_TEAMMATE_A,
        { type: "public" },
        "demo-place-12",
        "Try the hor fun"
      );

      expect(lobang.public_token).toBeTruthy();

      const forSelf = await demoRepo.listLobangsReceived(DEMO_TEAMMATE_A);
      const forOthers = await demoRepo.listLobangsReceived(DEMO_USER_ID);
      expect(forSelf.map((l) => l.id)).not.toContain(lobang.id);
      expect(forOthers.map((l) => l.id)).not.toContain(lobang.id);
    });

    it("never appears in the sender's own Sent list", async () => {
      const lobang = await demoRepo.sendLobang(
        DEMO_TEAMMATE_A,
        { type: "public" },
        "demo-place-12"
      );

      const sent = await demoRepo.listLobangsSent(DEMO_TEAMMATE_A);
      expect(sent.map((l) => l.id)).not.toContain(lobang.id);
    });

    it("resolves through getPublicLobang with the sender's real name and the note", async () => {
      const lobang = await demoRepo.sendLobang(
        DEMO_TEAMMATE_A,
        { type: "public" },
        "demo-place-12",
        "Try the hor fun"
      );

      const resolved = await demoRepo.getPublicLobang(lobang.public_token!);
      expect(resolved?.place.id).toBe("demo-place-12");
      expect(resolved?.note).toBe("Try the hor fun");
      expect(resolved?.from_display_name).toBeTruthy();
    });

    it("returns null for an unknown token", async () => {
      expect(await demoRepo.getPublicLobang("not-a-real-token")).toBeNull();
    });

    it("returns null once the place is no longer active", async () => {
      const lobang = await demoRepo.sendLobang(
        DEMO_TEAMMATE_A,
        { type: "public" },
        "demo-place-12"
      );

      // DEMO_USER_ID is the demo "admin" — any signed-in creator/admin can
      // block a place; who blocks it isn't what this test is about.
      await demoRepo.blockPlace(DEMO_USER_ID, "demo-place-12", "closed");

      expect(await demoRepo.getPublicLobang(lobang.public_token!)).toBeNull();
    });
  });
});
