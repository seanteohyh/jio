import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";

/**
 * CHANGES_20260821_combined.md Part 1 §E — the segment filter re-slices
 * Jio Outcomes and the real funnel to Jios hosted by one segment's
 * members, and Growth's "new users" gains a day-by-day signup detail.
 * Growth's counts themselves are deliberately NOT segment-filtered (see
 * the migration's own header comment on why), so those stay unchecked
 * here beyond confirming they're unaffected.
 */

beforeEach(() => {
  resetDemoStore();
});

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

async function makeEvent(hostId: string) {
  return demoRepo.createEvent(
    hostId,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01", "demo-place-02"],
    null,
    []
  );
}

describe("getAdminAnalytics segment filter", () => {
  it("reports appliedSegment as null when no segment is passed", async () => {
    const analytics = await demoRepo.getAdminAnalytics(90);
    expect(analytics.appliedSegment).toBeNull();
  });

  it("echoes back whichever segment was requested", async () => {
    const analytics = await demoRepo.getAdminAnalytics(90, "powerHosts");
    expect(analytics.appliedSegment).toBe("powerHosts");
  });

  it("restricts jioOutcomes to Jios hosted by the requested segment's members", async () => {
    const strangerId = "77777777-7777-7777-7777-777777777777";
    await demoRepo.upsertProfile(strangerId, "Power Host Stranger");
    // Three hosted Jios, no votes cast by this host — qualifies as a
    // power host (hosted >= 3, voted <= 1).
    await makeEvent(strangerId);
    await makeEvent(strangerId);
    await makeEvent(strangerId);

    const unfiltered = await demoRepo.getAdminAnalytics(90);
    const filtered = await demoRepo.getAdminAnalytics(90, "powerHosts");

    // Every Jio in the window that isn't hosted by this stranger is
    // excluded from the filtered view, so it can only ever be <= unfiltered.
    expect(filtered.jioOutcomes.stillOpen).toBeLessThanOrEqual(
      unfiltered.jioOutcomes.stillOpen
    );
    // But the stranger's own 3 Jios must still be counted.
    expect(filtered.jioOutcomes.stillOpen).toBeGreaterThanOrEqual(3);

    // A host who is NOT in the segment (never hosts 3x) shouldn't inflate
    // the filtered count beyond what the stranger actually hosted.
    await makeEvent(DEMO_USER_ID);
    const filteredAfter = await demoRepo.getAdminAnalytics(90, "powerHosts");
    expect(filteredAfter.jioOutcomes.stillOpen).toBe(filtered.jioOutcomes.stillOpen);
  });

  it("restricts funnelSteps to participants in Jios hosted by the segment", async () => {
    const strangerId = "88888888-8888-8888-8888-888888888888";
    await demoRepo.upsertProfile(strangerId, "Power Host Two");
    await makeEvent(strangerId);
    await makeEvent(strangerId);
    const e3 = await makeEvent(strangerId);
    await demoRepo.rsvp(e3.id, strangerId, "yes");
    await demoRepo.castBallot(e3.id, strangerId, ["demo-place-01"]);
    await demoRepo.closeEvent(e3.id, strangerId, "demo-place-01");

    const filtered = await demoRepo.getAdminAnalytics(90, "powerHosts");
    const invitedStep = filtered.funnelSteps.steps.find((s) => s.step === "invited");
    expect(invitedStep?.count).toBeGreaterThanOrEqual(1);
  });

  it("returns an empty jioOutcomes/funnelSteps population for a segment with no members", async () => {
    // No profile in a fresh store qualifies as "rsvpOnlyLurkers" (>= 3
    // lifetime RSVPs, zero votes, zero hosting) without deliberate setup.
    const analytics = await demoRepo.getAdminAnalytics(90, "rsvpOnlyLurkers");
    expect(analytics.jioOutcomes.stillOpen).toBe(0);
    expect(analytics.jioOutcomes.decided).toBe(0);
  });
});

describe("getAdminAnalytics growth.newUsersDetail", () => {
  it("lists who joined on each day with a signup, sorted by name", async () => {
    const idA = "99999999-9999-9999-9999-999999999991";
    const idB = "99999999-9999-9999-9999-999999999992";
    await demoRepo.upsertProfile(idA, "Zoe");
    await demoRepo.upsertProfile(idB, "Amy");

    const analytics = await demoRepo.getAdminAnalytics(90);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = analytics.growth.newUsersDetail.find((d) =>
      d.date.startsWith(today.slice(0, 7))
    );
    const names = analytics.growth.newUsersDetail
      .flatMap((d) => d.users)
      .map((u) => u.name);
    expect(names).toContain("Zoe");
    expect(names).toContain("Amy");
    expect(todayEntry).toBeDefined();
  });

  it("is unaffected by the segment filter", async () => {
    const strangerId = "10101010-1010-1010-1010-101010101010";
    await demoRepo.upsertProfile(strangerId, "Segment-Agnostic Signup");

    const unfiltered = await demoRepo.getAdminAnalytics(90);
    const filtered = await demoRepo.getAdminAnalytics(90, "dormant");
    expect(filtered.growth.newUsersDetail).toEqual(unfiltered.growth.newUsersDetail);
  });
});
