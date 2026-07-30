import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * Lobangs: a personalized recommendation sent to exactly one teammate.
 *
 * The two things worth guarding: a lobang is only ever visible to the two
 * people involved (not broadcast like a `reco`), and the "personalized"
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
      DEMO_USER_ID,
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
      DEMO_USER_ID,
      "demo-place-12",
      "Try the hor fun"
    );

    expect(lobang.place?.name).toBeTruthy();
    expect(lobang.from_display_name).toBeTruthy();
    expect(lobang.to_display_name).toBeTruthy();
    expect(lobang.note).toBe("Try the hor fun");
    expect(lobang.seen_at).toBeNull();
  });

  it("can only be marked seen by the recipient", async () => {
    const lobang = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      DEMO_USER_ID,
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
      DEMO_USER_ID,
      "demo-place-12"
    );
    const b = await demoRepo.sendLobang(
      DEMO_TEAMMATE_A,
      DEMO_USER_ID,
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
      DEMO_USER_ID,
      "demo-place-12"
    );

    await demoRepo.dismissLobang(DEMO_TEAMMATE_B, lobang.id);

    const received = await demoRepo.listLobangsReceived(DEMO_USER_ID);
    expect(received.map((l) => l.id)).toContain(lobang.id);
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
});
