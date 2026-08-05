import { describe, expect, it } from "vitest";
import { redactHiddenVotes, tallyIsHidden } from "@/lib/voting";
import type { EventDetail, EventVote } from "@/types";

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
