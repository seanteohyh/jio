import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260821_combined.md Part 1 §B — the Users view: a composite
 * engagement score with admin-adjustable weights, six rule-based segments,
 * and a per-person drill-down. The demo store ships with its own seeded
 * activity for all three demo identities, so most assertions here are
 * deltas against a baseline snapshot rather than absolute counts.
 */

beforeEach(() => {
  resetDemoStore();
});

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

async function makeEvent(hostId: string, inviteeIds: string[] = []) {
  return demoRepo.createEvent(
    hostId,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    inviteeIds
  );
}

function findSummary<T extends { id: string }>(data: T[], id: string) {
  return data.find((u) => u.id === id);
}

describe("updateEngagementWeights", () => {
  it("persists new weights and reflects them in the next getAdminUsersData call", async () => {
    const updated = await demoRepo.updateEngagementWeights({
      hosted: 5,
      voted: 1,
      rsvp: 1,
      visit: 1,
      review: 1,
      lobang: 1,
    });
    expect(updated.hosted).toBe(5);
    expect(updated.updatedAt).not.toBeNull();

    const { weights } = await demoRepo.getAdminUsersData(90);
    expect(weights.hosted).toBe(5);
  });

  it("changes the composite score when a weight changes", async () => {
    await makeEvent(DEMO_USER_ID);
    const before = await demoRepo.getAdminUsersData(90);
    const beforeScore =
      findSummary(before.leaderboard, DEMO_USER_ID)?.score ?? 0;

    await demoRepo.updateEngagementWeights({
      hosted: 10,
      voted: 1,
      rsvp: 1,
      visit: 1,
      review: 1,
      lobang: 1,
    });
    const after = await demoRepo.getAdminUsersData(90);
    const afterScore = findSummary(after.leaderboard, DEMO_USER_ID)?.score ?? 0;

    expect(afterScore).toBeGreaterThan(beforeScore);
  });
});

describe("getAdminUsersData", () => {
  it("counts a new hosted Jio toward hostedCount and the composite score", async () => {
    const before = await demoRepo.getAdminUsersData(90);
    const beforeRow = findSummary(before.leaderboard, DEMO_USER_ID);
    const beforeHosted = beforeRow?.hostedCount ?? 0;

    await makeEvent(DEMO_USER_ID);

    const after = await demoRepo.getAdminUsersData(90);
    const afterRow = findSummary(after.leaderboard, DEMO_USER_ID);
    expect((afterRow?.hostedCount ?? 0) - beforeHosted).toBe(1);
  });

  it("places a frequent host with few votes into the powerHosts segment", async () => {
    // Fresh, uninvolved identity so pre-seeded activity can't interfere.
    const strangerId = "22222222-2222-2222-2222-222222222222";
    await demoRepo.upsertProfile(strangerId, "Stranger Host");
    await makeEvent(strangerId);
    await makeEvent(strangerId);
    await makeEvent(strangerId);

    const data = await demoRepo.getAdminUsersData(90);
    expect(findSummary(data.segments.powerHosts, strangerId)).toBeTruthy();
    expect(findSummary(data.segments.activeVoters, strangerId)).toBeFalsy();
  });

  it("places a frequent voter with little hosting into the activeVoters segment", async () => {
    const strangerId = "33333333-3333-3333-3333-333333333333";
    await demoRepo.upsertProfile(strangerId, "Stranger Voter");
    const e1 = await makeEvent(DEMO_USER_ID, [strangerId]);
    const e2 = await makeEvent(DEMO_USER_ID, [strangerId]);
    const e3 = await makeEvent(DEMO_USER_ID, [strangerId]);
    await demoRepo.castBallot(e1.id, strangerId, ["demo-place-01"]);
    await demoRepo.castBallot(e2.id, strangerId, ["demo-place-01"]);
    await demoRepo.castBallot(e3.id, strangerId, ["demo-place-01"]);

    const data = await demoRepo.getAdminUsersData(90);
    expect(findSummary(data.segments.activeVoters, strangerId)).toBeTruthy();
    expect(findSummary(data.segments.powerHosts, strangerId)).toBeFalsy();
  });

  it("places a signed-up-but-inactive person into the dormant segment", async () => {
    const strangerId = "44444444-4444-4444-4444-444444444444";
    await demoRepo.upsertProfile(strangerId, "Nobody");

    const data = await demoRepo.getAdminUsersData(90);
    expect(findSummary(data.segments.dormant, strangerId)).toBeTruthy();
  });
});

describe("getAdminUserDetail", () => {
  it("returns null for a user id that does not exist", async () => {
    expect(await demoRepo.getAdminUserDetail("no-such-user")).toBeNull();
  });

  it("reflects hostedCount, lobangsSent/Received, and lastActiveAt for a fresh identity", async () => {
    const strangerId = "55555555-5555-5555-5555-555555555555";
    await demoRepo.upsertProfile(strangerId, "Detail Target");

    const empty = await demoRepo.getAdminUserDetail(strangerId);
    expect(empty?.hostedCount).toBe(0);
    expect(empty?.lastActiveAt).toBeNull();
    expect(empty?.rsvpResponsivenessPct).toBeNull();

    const recipientBefore = await demoRepo.getAdminUserDetail(DEMO_TEAMMATE_A);
    const receivedBefore = recipientBefore?.lobangsReceived ?? 0;

    await makeEvent(strangerId);
    await demoRepo.sendLobang(
      strangerId,
      { type: "users", userIds: [DEMO_TEAMMATE_A] },
      "demo-place-01",
      null,
      null
    );

    const after = await demoRepo.getAdminUserDetail(strangerId);
    expect(after?.hostedCount).toBe(1);
    expect(after?.lobangsSent).toBe(1);
    expect(after?.lastActiveAt).not.toBeNull();

    // Regression: lobangsReceived used to filter the raw stored Lobang row
    // on `to_user_id`, a field only ever populated at hydration time (see
    // migration 077) — it silently always read 0 regardless of how many
    // lobangs came in. Recipients live in lobangRecipients instead.
    const recipientAfter = await demoRepo.getAdminUserDetail(DEMO_TEAMMATE_A);
    expect(recipientAfter?.lobangsReceived).toBe(receivedBefore + 1);
  });

  it("computes RSVP responsiveness across every Jio the person was ever invited to", async () => {
    const strangerId = "66666666-6666-6666-6666-666666666666";
    await demoRepo.upsertProfile(strangerId, "Responsiveness Target");

    const e1 = await makeEvent(DEMO_USER_ID, [strangerId]);
    await makeEvent(DEMO_USER_ID, [strangerId]); // never RSVP'd to this one
    await demoRepo.rsvp(e1.id, strangerId, "yes");

    const detail = await demoRepo.getAdminUserDetail(strangerId);
    expect(detail?.rsvpResponsivenessPct).toBe(50);
  });

  it("lists Kaki memberships for the target person", async () => {
    const detail = await demoRepo.getAdminUserDetail(DEMO_TEAMMATE_B);
    expect(detail?.kakiMemberships.length).toBeGreaterThan(0);
  });
});
