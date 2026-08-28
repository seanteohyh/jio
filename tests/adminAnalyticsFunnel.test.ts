import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260821_combined.md Part 1 §D — the real step funnel
 * (invited -> responded -> voted -> attended -> reviewed), scoped to
 * decided Jios (closed with a winner) in the window. Distinct from
 * `adminAnalytics.test.ts`, which covers the pure bucketing helpers this
 * feature also relies on — these tests exercise the funnel population
 * logic itself, which lives inside demoRepo.getAdminAnalytics.
 *
 * The demo store ships with its own seeded events, some already closed
 * with a winner inside the default 90-day window, so every assertion here
 * is a *delta* against a baseline snapshot taken right after reset rather
 * than an absolute count.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetDemoStore();
});

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

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

function stepCount(
  steps: { step: string; count: number }[],
  step: string
): number {
  return steps.find((s) => s.step === step)?.count ?? 0;
}

async function stepCounts() {
  const analytics = await demoRepo.getAdminAnalytics(90);
  return {
    invited: stepCount(analytics.funnelSteps.steps, "invited"),
    responded: stepCount(analytics.funnelSteps.steps, "responded"),
    voted: stepCount(analytics.funnelSteps.steps, "voted"),
    attended: stepCount(analytics.funnelSteps.steps, "attended"),
    reviewed: stepCount(analytics.funnelSteps.steps, "reviewed"),
  };
}

describe("getAdminAnalytics funnelSteps", () => {
  it("does not count a still-open Jio toward the funnel at all", async () => {
    const before = await stepCounts();
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");

    const after = await stepCounts();
    expect(after).toEqual(before);
  });

  it("counts every step correctly with mixed responses", async () => {
    const before = await stepCounts();
    const event = await makeEvent([DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]);
    // Host: full completion, votes, and (later) reviews.
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-01",
      "demo-place-02",
    ]);
    // Teammate A: responds yes but never votes — closed manually below
    // rather than via auto-close, since auto-close itself requires every
    // yes-RSVP to have voted first (covered by autoClose.test.ts already).
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    // Teammate B: never responds at all.
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "no");

    const closed = await demoRepo.closeEvent(
      event.id,
      DEMO_USER_ID,
      "demo-place-01"
    );
    expect(closed.status).toBe("closed");
    expect(closed.winner_place_id).toBe("demo-place-01");

    await demoRepo.createVisit({
      place_id: "demo-place-01",
      user_id: DEMO_USER_ID,
      rating: 5,
      best_dishes: [],
      notes: null,
      visited_at: new Date().toISOString().slice(0, 10),
      is_public: false,
    });

    const after = await stepCounts();
    // invited: host + A + B = 3 new invite-instances
    expect(after.invited - before.invited).toBe(3);
    // responded: all three now have an RSVP (yes, yes, no)
    expect(after.responded - before.responded).toBe(3);
    // voted: only the host cast a ballot
    expect(after.voted - before.voted).toBe(1);
    // attended (RSVP'd yes): host + A
    expect(after.attended - before.attended).toBe(2);
    // reviewed: only the host logged a visit to the winning place
    expect(after.reviewed - before.reviewed).toBe(1);
  });

  it("does not count a visit logged before the Jio closed as 'reviewed'", async () => {
    const before = await stepCounts();
    const event = await makeEvent();
    await demoRepo.createVisit({
      place_id: "demo-place-01",
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: new Date().toISOString().slice(0, 10),
      is_public: false,
    });
    await sleep(5);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    const closed = await demoRepo.maybeAutoCloseEvent(event.id);
    expect(closed?.status).toBe("closed");

    const after = await stepCounts();
    expect(after.attended - before.attended).toBe(1);
    expect(after.reviewed - before.reviewed).toBe(0);
  });

  it("excludes a closed Jio with no winner from the funnel population", async () => {
    const before = await stepCounts();
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "no");
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "no");
    const closed = await demoRepo.maybeAutoCloseEvent(event.id);
    expect(closed?.status).toBe("closed");
    expect(closed?.winner_place_id).toBeNull();

    const after = await stepCounts();
    expect(after).toEqual(before);
  });

  it("groups the same signup-week cohort's counts across a decided Jio", async () => {
    const before = await demoRepo.getAdminAnalytics(90);
    const beforeRow = before.funnelSteps.cohortBySignupWeek[0] ?? {
      weekStart: "",
      invited: 0,
      responded: 0,
      voted: 0,
      attended: 0,
      reviewed: 0,
    };

    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "no");
    await demoRepo.maybeAutoCloseEvent(event.id);

    const after = await demoRepo.getAdminAnalytics(90);
    // Demo seed data gives every seeded profile the same signup date, so
    // both participants collapse into the one existing cohort row.
    expect(after.funnelSteps.cohortBySignupWeek).toHaveLength(1);
    const afterRow = after.funnelSteps.cohortBySignupWeek[0];
    expect(afterRow.invited - beforeRow.invited).toBe(2);
    expect(afterRow.responded - beforeRow.responded).toBe(2);
    expect(afterRow.attended - beforeRow.attended).toBe(1);
  });
});
