import { beforeEach, describe, expect, it } from "vitest";
import { redactHiddenVotes, tallyIsHidden } from "@/lib/voting";
import type { EventDetail, EventVote } from "@/types";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";

/**
 * CHANGES_20260803_1.md §14 — a hidden-vote Jio blinds the running standing
 * while it's open, host included. Every route that returns an EventDetail
 * routes it through `redactHiddenVotes` rather than each handler reasoning
 * about hide_votes itself, precisely because there are enough call sites
 * (vote, options, rsvp, invitees, availability, candidate-dates,
 * suggest-options, the GET detail route) that hand-checking each one is how
 * this class of bug slips through — see §1 and §12a for two that already did.
 */
function votes(...userIds: string[]): EventVote[] {
  return userIds.map((userId, i) => ({
    event_id: "event-1",
    user_id: userId,
    place_id: "place-a",
    rank: 1 + i,
  }));
}

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: "event-1",
    office_id: "office-1",
    host_id: "host-1",
    title: "Lunch",
    scheduled_at: new Date().toISOString(),
    status: "open",
    invite_token: "token",
    hide_votes: false,
    options: [],
    votes: [],
    rsvps: [],
    invitees: [],
    tally: {},
    candidateDates: [],
    dateVotes: [],
    ...overrides,
  };
}

describe("tallyIsHidden", () => {
  it("is hidden only while open and hide_votes is set", () => {
    expect(tallyIsHidden({ hide_votes: true, status: "open" })).toBe(true);
  });

  it("is not hidden once closed, even with hide_votes set", () => {
    expect(tallyIsHidden({ hide_votes: true, status: "closed" })).toBe(false);
  });

  it("is not hidden when hide_votes was never set", () => {
    expect(tallyIsHidden({ hide_votes: false, status: "open" })).toBe(false);
    expect(tallyIsHidden({ status: "open" })).toBe(false);
  });
});

describe("redactHiddenVotes", () => {
  it("strips votes and tally while a hidden Jio is open", () => {
    const e = event({
      hide_votes: true,
      votes: votes("alex", "mei"),
      tally: { "place-a": 3 },
    });

    const redacted = redactHiddenVotes(e);

    expect(redacted.votes).toEqual([]);
    expect(redacted.tally).toEqual({});
    expect(redacted.voter_count).toBe(2);
  });

  it("leaves votes and tally intact when hide_votes is unset", () => {
    const e = event({
      votes: votes("alex", "mei"),
      tally: { "place-a": 3 },
    });

    const redacted = redactHiddenVotes(e);

    expect(redacted.votes).toHaveLength(2);
    expect(redacted.tally).toEqual({ "place-a": 3 });
    expect(redacted.voter_count).toBe(2);
  });

  it("reveals everything once a hidden Jio closes", () => {
    const e = event({
      hide_votes: true,
      status: "closed",
      votes: votes("alex", "mei"),
      tally: { "place-a": 3 },
    });

    const redacted = redactHiddenVotes(e);

    expect(redacted.votes).toHaveLength(2);
    expect(redacted.tally).toEqual({ "place-a": 3 });
  });

  it("counts distinct voters, not ballot rows", () => {
    // Two ranked entries from the same voter must count once, not twice.
    const e = event({
      hide_votes: true,
      votes: [
        { event_id: "event-1", user_id: "alex", place_id: "place-a", rank: 1 },
        { event_id: "event-1", user_id: "alex", place_id: "place-b", rank: 2 },
      ],
    });

    expect(redactHiddenVotes(e).voter_count).toBe(1);
  });
});

/**
 * A real host asked for this: a recurring Jio's occurrences are generated
 * with no creation-time form of their own (`generateDueOccurrences`), so
 * they can never start hidden — the only way to hide one is after the
 * fact. Works either direction; hiding even once some votes are already
 * visible is fine, since anyone can still revote.
 */
describe("setHideVotes", () => {
  const TOMORROW = new Date(Date.now() + 86400000).toISOString();

  beforeEach(() => {
    resetDemoStore();
  });

  async function makeEvent(hideVotes: boolean) {
    return demoRepo.createEvent(
      DEMO_USER_ID,
      "Test lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      hideVotes
    );
  }

  it("lets the host hide an open Jio's votes", async () => {
    const created = await makeEvent(false);
    expect(created.hide_votes).toBe(false);

    const updated = await demoRepo.setHideVotes(created.id, DEMO_USER_ID, true);
    expect(updated.hide_votes).toBe(true);
    expect(tallyIsHidden(updated)).toBe(true);
  });

  it("lets the host reveal a hidden Jio's votes", async () => {
    const created = await makeEvent(true);
    expect(created.hide_votes).toBe(true);

    const updated = await demoRepo.setHideVotes(created.id, DEMO_USER_ID, false);
    expect(updated.hide_votes).toBe(false);
    expect(tallyIsHidden(updated)).toBe(false);
  });

  it("refuses anyone but the host", async () => {
    const created = await makeEvent(false);
    await expect(
      demoRepo.setHideVotes(created.id, DEMO_TEAMMATE_A, true)
    ).rejects.toThrow();
  });

  it("refuses once the Jio isn't open", async () => {
    const created = await makeEvent(false);
    await demoRepo.closeEvent(created.id, DEMO_USER_ID, "demo-place-01");
    await expect(
      demoRepo.setHideVotes(created.id, DEMO_USER_ID, true)
    ).rejects.toThrow();
  });

  it("hiding after some votes are already visible still blinds the standing", async () => {
    const created = await makeEvent(false);
    await demoRepo.castBallot(created.id, DEMO_TEAMMATE_A, ["demo-place-01"]);

    const openDetail = await demoRepo.getEvent(created.id);
    expect(redactHiddenVotes(openDetail!).votes.length).toBeGreaterThan(0);

    await demoRepo.setHideVotes(created.id, DEMO_USER_ID, true);
    const hiddenDetail = await demoRepo.getEvent(created.id);
    expect(redactHiddenVotes(hiddenDetail!).votes).toEqual([]);
  });

  it("actually surfaces votes and tally once revealed", async () => {
    const created = await makeEvent(true);
    await demoRepo.castBallot(created.id, DEMO_TEAMMATE_A, ["demo-place-01"]);

    const hiddenDetail = await demoRepo.getEvent(created.id);
    const hiddenView = redactHiddenVotes(hiddenDetail!);
    expect(hiddenView.votes).toEqual([]);

    await demoRepo.setHideVotes(created.id, DEMO_USER_ID, false);
    const revealedDetail = await demoRepo.getEvent(created.id);
    const revealedView = redactHiddenVotes(revealedDetail!);
    expect(revealedView.votes.length).toBeGreaterThan(0);
  });
});
