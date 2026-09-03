import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";
import { qualifiesForKakiBridgeSuggestion } from "@/lib/kakiBridge";

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

describe("qualifiesForKakiBridgeSuggestion", () => {
  const base = {
    isHost: true,
    eventStatus: "closed" as const,
    hasWinner: true,
    alreadyLinkedToKaki: false,
    participantCount: 2,
    alreadyDismissed: false,
    alreadyHasMatchingKaki: false,
  };

  it("qualifies for a decided, ad-hoc, multi-person Jio with no matching Kaki", () => {
    expect(qualifiesForKakiBridgeSuggestion(base)).toBe(true);
  });

  it("never fires for anyone but the host", () => {
    expect(qualifiesForKakiBridgeSuggestion({ ...base, isHost: false })).toBe(
      false
    );
  });

  it("does not fire for a still-open Jio", () => {
    expect(
      qualifiesForKakiBridgeSuggestion({ ...base, eventStatus: "open" })
    ).toBe(false);
  });

  it("does not fire for a Jio closed with no winner", () => {
    expect(qualifiesForKakiBridgeSuggestion({ ...base, hasWinner: false })).toBe(
      false
    );
  });

  it("does not fire when the Jio is already linked to a Kaki", () => {
    expect(
      qualifiesForKakiBridgeSuggestion({ ...base, alreadyLinkedToKaki: true })
    ).toBe(false);
  });

  it("does not fire for a solo Jio (host only, nobody else)", () => {
    expect(
      qualifiesForKakiBridgeSuggestion({ ...base, participantCount: 1 })
    ).toBe(false);
  });

  it("does not fire once dismissed", () => {
    expect(
      qualifiesForKakiBridgeSuggestion({ ...base, alreadyDismissed: true })
    ).toBe(false);
  });

  it("does not fire once a matching Kaki already exists", () => {
    expect(
      qualifiesForKakiBridgeSuggestion({ ...base, alreadyHasMatchingKaki: true })
    ).toBe(false);
  });
});

async function makeEvent(inviteeIds: string[] = []) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    inviteeIds
  );
}

describe("hasMatchingKakiForParticipants", () => {
  it("returns false when the host belongs to no Kaki at all", async () => {
    expect(
      await demoRepo.hasMatchingKakiForParticipants(DEMO_USER_ID, [
        DEMO_USER_ID,
        DEMO_TEAMMATE_A,
      ])
    ).toBe(false);
  });

  it("returns true once a Kaki with exactly that member set exists", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Test crew", [
      DEMO_TEAMMATE_A,
    ]);
    expect(
      await demoRepo.hasMatchingKakiForParticipants(DEMO_USER_ID, [
        DEMO_USER_ID,
        DEMO_TEAMMATE_A,
      ])
    ).toBe(true);
    // Sanity: the Kaki really was created with both members.
    const detail = await demoRepo.getKaki(kaki.id);
    expect(detail?.members.map((m) => m.user_id).sort()).toEqual(
      [DEMO_USER_ID, DEMO_TEAMMATE_A].sort()
    );
  });

  it("returns false when an existing Kaki has an extra member the Jio group doesn't", async () => {
    await demoRepo.createKaki(DEMO_USER_ID, "Bigger crew", [
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_B,
    ]);
    expect(
      await demoRepo.hasMatchingKakiForParticipants(DEMO_USER_ID, [
        DEMO_USER_ID,
        DEMO_TEAMMATE_A,
      ])
    ).toBe(false);
  });

  it("returns false when an existing Kaki is missing a member the Jio group has", async () => {
    // A fabricated fourth identity — DEMO_USER_ID/A/B are already the seeded
    // demo Kaki's exact triple, which would otherwise coincidentally match.
    const stranger = "44444444-4444-4444-4444-444444444444";
    await demoRepo.createKaki(DEMO_USER_ID, "Smaller crew", [DEMO_TEAMMATE_A]);
    expect(
      await demoRepo.hasMatchingKakiForParticipants(DEMO_USER_ID, [
        DEMO_USER_ID,
        DEMO_TEAMMATE_A,
        stranger,
      ])
    ).toBe(false);
  });
});

describe("hasDismissedKakiBridgeSuggestion / dismissKakiBridgeSuggestion", () => {
  it("reports false, then true after dismissing", async () => {
    const event = await makeEvent();
    expect(
      await demoRepo.hasDismissedKakiBridgeSuggestion(DEMO_USER_ID, event.id)
    ).toBe(false);

    await demoRepo.dismissKakiBridgeSuggestion(DEMO_USER_ID, event.id);

    expect(
      await demoRepo.hasDismissedKakiBridgeSuggestion(DEMO_USER_ID, event.id)
    ).toBe(true);
  });

  it("is idempotent", async () => {
    const event = await makeEvent();
    await demoRepo.dismissKakiBridgeSuggestion(DEMO_USER_ID, event.id);
    await expect(
      demoRepo.dismissKakiBridgeSuggestion(DEMO_USER_ID, event.id)
    ).resolves.not.toThrow();
  });

  it("is scoped per event", async () => {
    const eventA = await makeEvent();
    const eventB = await makeEvent();
    await demoRepo.dismissKakiBridgeSuggestion(DEMO_USER_ID, eventA.id);

    expect(
      await demoRepo.hasDismissedKakiBridgeSuggestion(DEMO_USER_ID, eventA.id)
    ).toBe(true);
    expect(
      await demoRepo.hasDismissedKakiBridgeSuggestion(DEMO_USER_ID, eventB.id)
    ).toBe(false);
  });
});

describe("createKaki with initialMemberIds", () => {
  it("adds every initial member alongside the creator", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "New crew", [
      DEMO_TEAMMATE_A,
      DEMO_TEAMMATE_B,
    ]);
    expect(kaki.member_count).toBe(3);

    const detail = await demoRepo.getKaki(kaki.id);
    expect(detail?.members.map((m) => m.user_id).sort()).toEqual(
      [DEMO_USER_ID, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B].sort()
    );
  });

  it("dedupes the creator if they're also passed as an initial member", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "New crew", [
      DEMO_USER_ID,
      DEMO_TEAMMATE_A,
    ]);
    expect(kaki.member_count).toBe(2);
  });

  it("still works with no initial members at all", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Solo crew");
    expect(kaki.member_count).toBe(1);
  });
});

describe("end to end: a decided ad-hoc Jio's bridge condition, wired through a real close", () => {
  it("qualifies for a fresh group with no existing Kaki", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);
    const detail = await demoRepo.getEvent(event.id);

    const participantIds = Array.from(
      new Set([detail!.host_id, ...detail!.invitees.map((i) => i.user_id)])
    );
    const [alreadyDismissed, alreadyHasMatchingKaki] = await Promise.all([
      demoRepo.hasDismissedKakiBridgeSuggestion(DEMO_USER_ID, event.id),
      demoRepo.hasMatchingKakiForParticipants(DEMO_USER_ID, participantIds),
    ]);

    expect(
      qualifiesForKakiBridgeSuggestion({
        isHost: true,
        eventStatus: closed.status,
        hasWinner: Boolean(closed.winner_place_id),
        alreadyLinkedToKaki: Boolean(detail!.kaki_id),
        participantCount: participantIds.length,
        alreadyDismissed,
        alreadyHasMatchingKaki,
      })
    ).toBe(true);
  });

  it("stops qualifying once that exact Kaki is created", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    await demoRepo.createKaki(DEMO_USER_ID, "The Crew", [DEMO_TEAMMATE_A]);

    const detail = await demoRepo.getEvent(event.id);
    const participantIds = Array.from(
      new Set([detail!.host_id, ...detail!.invitees.map((i) => i.user_id)])
    );
    expect(
      await demoRepo.hasMatchingKakiForParticipants(DEMO_USER_ID, participantIds)
    ).toBe(true);
  });

  it("does not qualify once dismissed", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.closeEvent(event.id, DEMO_USER_ID);
    await demoRepo.dismissKakiBridgeSuggestion(DEMO_USER_ID, event.id);

    expect(
      await demoRepo.hasDismissedKakiBridgeSuggestion(DEMO_USER_ID, event.id)
    ).toBe(true);
  });

  it("never qualifies for a Jio already linked to a Kaki", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Existing crew");
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      kaki.id,
      []
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.kaki_id).toBe(kaki.id);
  });
});
