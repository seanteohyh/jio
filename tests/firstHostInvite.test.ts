import { describe, expect, it } from "vitest";
import {
  buildFirstHostInvite,
  pickFirstHostSourceEvent,
} from "@/lib/firstHostInvite";
import type { EventDetail, LunchEvent } from "@/types";

const USER = "user-1";
const HOST_A = "host-a";
const HOST_B = "host-b";

function ev(overrides: Partial<LunchEvent> & { id: string }): LunchEvent {
  return {
    office_id: "office-1",
    host_id: HOST_A,
    title: "Lunch",
    scheduled_at: "2026-08-01T04:00:00.000Z",
    status: "closed",
    invite_token: `token-${overrides.id}`,
    ...overrides,
  };
}

describe("pickFirstHostSourceEvent", () => {
  it("returns null once the account has hosted anything at all", () => {
    const events = [
      ev({ id: "e1", host_id: USER }),
      ev({ id: "e2", host_id: HOST_A, scheduled_at: "2026-08-05T04:00:00.000Z" }),
    ];
    expect(pickFirstHostSourceEvent(events, USER)).toBeNull();
  });

  it("returns null for an account with no Jio history at all", () => {
    expect(pickFirstHostSourceEvent([], USER)).toBeNull();
  });

  it("picks the most recently scheduled Jio joined as a guest", () => {
    const older = ev({ id: "older", host_id: HOST_A, scheduled_at: "2026-08-01T04:00:00.000Z" });
    const newer = ev({ id: "newer", host_id: HOST_B, scheduled_at: "2026-08-10T04:00:00.000Z" });
    const events = [older, newer];
    expect(pickFirstHostSourceEvent(events, USER)?.id).toBe("newer");
  });

  it("ignores host_id — only ever considers Jios this account did not host", () => {
    // Sanity: with a single guest Jio, that one is picked regardless of
    // anyone else's scheduled_at ordering.
    const onlyJoined = ev({ id: "only", host_id: HOST_A });
    expect(pickFirstHostSourceEvent([onlyJoined], USER)?.id).toBe("only");
  });
});

function detail(overrides: {
  host_id: string;
  invitees: string[];
}): EventDetail {
  return {
    id: "src",
    office_id: "office-1",
    host_id: overrides.host_id,
    title: "Lunch",
    scheduled_at: "2026-08-01T04:00:00.000Z",
    status: "closed",
    invite_token: "token-src",
    options: [],
    votes: [],
    rsvps: [],
    invitees: overrides.invitees.map((user_id) => ({
      event_id: "src",
      user_id,
      invited_by: overrides.host_id,
      created_at: "2026-08-01T00:00:00.000Z",
    })),
    candidateDates: [],
  } as unknown as EventDetail;
}

describe("buildFirstHostInvite", () => {
  it("pre-checks the source Jio's host plus its invitees", () => {
    const source = detail({ host_id: HOST_A, invitees: [HOST_B, "guest-3"] });
    expect(buildFirstHostInvite(source, USER)).toEqual({
      userIds: [HOST_A, HOST_B, "guest-3"],
      kakiIds: [],
    });
  });

  it("excludes the current user even if they appear in the invitee list", () => {
    const source = detail({ host_id: HOST_A, invitees: [USER, HOST_B] });
    expect(buildFirstHostInvite(source, USER)).toEqual({
      userIds: [HOST_A, HOST_B],
      kakiIds: [],
    });
  });

  it("dedupes a host who also somehow appears in invitees", () => {
    const source = detail({ host_id: HOST_A, invitees: [HOST_A, HOST_B] });
    expect(buildFirstHostInvite(source, USER)?.userIds).toEqual([HOST_A, HOST_B]);
  });

  it("returns null when nobody would end up pre-checked", () => {
    const source = detail({ host_id: USER, invitees: [] });
    expect(buildFirstHostInvite(source, USER)).toBeNull();
  });

  it("never pre-checks a Kaki group, only individual people", () => {
    const source = detail({ host_id: HOST_A, invitees: [HOST_B] });
    expect(buildFirstHostInvite(source, USER)?.kakiIds).toEqual([]);
  });
});
