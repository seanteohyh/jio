import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * Who may put a place on the table, and who may take it off again.
 *
 * These rules are enforced twice: here in application code (for readable
 * errors) and in the RLS policy from migration 013 (which is the real gate).
 * These tests cover the application half; the policy is exercised against a
 * live database.
 */

const STRANGER = "00000000-0000-0000-0000-0000000stranger";
const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

async function makeEvent(options?: {
  kakiId?: string | null;
  inviteeIds?: string[];
  placeIds?: string[];
}) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    options?.placeIds ?? ["demo-place-01"],
    options?.kakiId ?? null,
    options?.inviteeIds ?? []
  );
}

describe("adding an option", () => {
  it("lets the host add a place", async () => {
    const event = await makeEvent();
    await demoRepo.addOptionToEvent(event.id, "demo-place-02", DEMO_USER_ID);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.options.map((o) => o.place_id)).toContain("demo-place-02");
  });

  it("lets a member of the linked kaki add a place", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Test group");
    await demoRepo.joinKaki(kaki.invite_token, DEMO_TEAMMATE_A);

    const event = await makeEvent({ kakiId: kaki.id });
    await demoRepo.addOptionToEvent(event.id, "demo-place-03", DEMO_TEAMMATE_A);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.options.map((o) => o.place_id)).toContain("demo-place-03");
  });

  it("lets an explicit invitee add a place", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_B] });
    await demoRepo.addOptionToEvent(event.id, "demo-place-04", DEMO_TEAMMATE_B);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.options.map((o) => o.place_id)).toContain("demo-place-04");
  });

  it("rejects someone with no connection to the event", async () => {
    const event = await makeEvent();

    await expect(
      demoRepo.addOptionToEvent(event.id, "demo-place-05", STRANGER)
    ).rejects.toThrow(/host, kaki members or invitees/i);
  });

  it("rejects a kaki member when the event is not linked to that kaki", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Unlinked group");
    await demoRepo.joinKaki(kaki.invite_token, DEMO_TEAMMATE_A);

    const event = await makeEvent({ kakiId: null });

    await expect(
      demoRepo.addOptionToEvent(event.id, "demo-place-06", DEMO_TEAMMATE_A)
    ).rejects.toThrow(/host, kaki members or invitees/i);
  });

  it("rejects a duplicate option", async () => {
    const event = await makeEvent({ placeIds: ["demo-place-01"] });

    await expect(
      demoRepo.addOptionToEvent(event.id, "demo-place-01", DEMO_USER_ID)
    ).rejects.toThrow(/already an option/i);
  });

  it("rejects a place that does not exist", async () => {
    const event = await makeEvent();

    await expect(
      demoRepo.addOptionToEvent(event.id, "no-such-place", DEMO_USER_ID)
    ).rejects.toThrow(/not found/i);
  });

  it("rejects an addition to a closed event", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    await expect(
      demoRepo.addOptionToEvent(event.id, "demo-place-02", DEMO_USER_ID)
    ).rejects.toThrow(/already closed/i);
  });

  it("rejects an unknown event", async () => {
    await expect(
      demoRepo.addOptionToEvent("no-such-event", "demo-place-01", DEMO_USER_ID)
    ).rejects.toThrow(/not found/i);
  });

  it("records who added each option", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_B] });
    await demoRepo.addOptionToEvent(event.id, "demo-place-07", DEMO_TEAMMATE_B);

    const detail = await demoRepo.getEvent(event.id);
    const option = detail?.options.find((o) => o.place_id === "demo-place-07");

    expect(option?.added_by).toBe(DEMO_TEAMMATE_B);
  });
});

describe("removing an option", () => {
  it("lets the host remove anything", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_B] });
    await demoRepo.addOptionToEvent(event.id, "demo-place-08", DEMO_TEAMMATE_B);
    await demoRepo.removeOptionFromEvent(
      event.id,
      "demo-place-08",
      DEMO_USER_ID
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.options.map((o) => o.place_id)).not.toContain(
      "demo-place-08"
    );
  });

  it("lets whoever added an option remove it again", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_B] });
    await demoRepo.addOptionToEvent(event.id, "demo-place-09", DEMO_TEAMMATE_B);
    await demoRepo.removeOptionFromEvent(
      event.id,
      "demo-place-09",
      DEMO_TEAMMATE_B
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.options.map((o) => o.place_id)).not.toContain(
      "demo-place-09"
    );
  });

  it("stops one invitee removing another's suggestion", async () => {
    const event = await makeEvent({
      inviteeIds: [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B],
    });
    await demoRepo.addOptionToEvent(event.id, "demo-place-10", DEMO_TEAMMATE_B);

    await expect(
      demoRepo.removeOptionFromEvent(
        event.id,
        "demo-place-10",
        DEMO_TEAMMATE_A
      )
    ).rejects.toThrow(/host or whoever added it/i);
  });

  it("rejects removing something that is not an option", async () => {
    const event = await makeEvent();

    await expect(
      demoRepo.removeOptionFromEvent(event.id, "demo-place-20", DEMO_USER_ID)
    ).rejects.toThrow(/not an option/i);
  });

  it("drops ballot rows that pointed at the removed option", async () => {
    // Otherwise the Borda count keeps scoring a place nobody can pick.
    const event = await makeEvent({
      placeIds: ["demo-place-01", "demo-place-02"],
    });
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-02",
      "demo-place-01",
    ]);

    let detail = await demoRepo.getEvent(event.id);
    expect(detail?.votes).toHaveLength(2);

    await demoRepo.removeOptionFromEvent(
      event.id,
      "demo-place-02",
      DEMO_USER_ID
    );

    detail = await demoRepo.getEvent(event.id);
    expect(detail?.votes.map((v) => v.place_id)).not.toContain("demo-place-02");
  });
});

describe("invitees", () => {
  it("persists invitees added at creation time", async () => {
    const event = await makeEvent({
      inviteeIds: [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B],
    });
    const detail = await demoRepo.getEvent(event.id);

    expect(detail?.invitees.map((i) => i.user_id).sort()).toEqual(
      [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B].sort()
    );
  });

  it("never adds the host as their own invitee", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_USER_ID] });
    const detail = await demoRepo.getEvent(event.id);

    expect(detail?.invitees).toHaveLength(0);
  });

  it("lets the host invite more people later", async () => {
    const event = await makeEvent();
    await demoRepo.addInviteesToEvent(
      event.id,
      [DEMO_TEAMMATE_A],
      DEMO_USER_ID
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).toContain(DEMO_TEAMMATE_A);
  });

  it("stops a non-host inviting people", async () => {
    const event = await makeEvent();

    await expect(
      demoRepo.addInviteesToEvent(event.id, [STRANGER], DEMO_TEAMMATE_A)
    ).rejects.toThrow(/only the host/i);
  });

  it("does not duplicate an invitee added twice", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_A] });
    await demoRepo.addInviteesToEvent(
      event.id,
      [DEMO_TEAMMATE_A],
      DEMO_USER_ID
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees).toHaveLength(1);
  });
});

describe("joining via an invite link", () => {
  // CHANGES_20260804.md §4 — following a share link never used to leave any
  // footprint, so a visitor who never RSVP'd or voted was invisible to
  // listEvents() everywhere it's used, Jios tab included, even though
  // reading the event itself was always allowed.
  it("makes a stranger visible in listEvents after they join", async () => {
    const event = await makeEvent();
    expect(
      (await demoRepo.listEvents(STRANGER)).map((e) => e.id)
    ).not.toContain(event.id);

    await demoRepo.joinEventViaInvite(event.id, STRANGER);

    expect(
      (await demoRepo.listEvents(STRANGER)).map((e) => e.id)
    ).toContain(event.id);
  });

  it("records the joiner as a real invitee, not just a visibility flag", async () => {
    const event = await makeEvent();
    await demoRepo.joinEventViaInvite(event.id, STRANGER);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).toContain(STRANGER);
  });

  // CHANGES_20260821_combined2.md §2 — /e/[token]'s first-timer redirect
  // checks listEvents(user.id) *before* calling joinEventViaInvite, since a
  // stranger's very first join is what would otherwise make that list
  // non-empty. This pins the ordering assumption: empty before, non-empty
  // (containing exactly this join) after.
  it("is empty for a genuine first-timer right up until their first join", async () => {
    const event = await makeEvent();
    expect(await demoRepo.listEvents(STRANGER)).toEqual([]);

    await demoRepo.joinEventViaInvite(event.id, STRANGER);

    const afterJoin = await demoRepo.listEvents(STRANGER);
    expect(afterJoin).toHaveLength(1);
    expect(afterJoin[0].id).toBe(event.id);
  });

  it("is a no-op for the host joining their own event", async () => {
    const event = await makeEvent();
    await demoRepo.joinEventViaInvite(event.id, DEMO_USER_ID);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.invitees.map((i) => i.user_id)).not.toContain(
      DEMO_USER_ID
    );
  });

  it("does not duplicate an invitee who joins twice", async () => {
    const event = await makeEvent();
    await demoRepo.joinEventViaInvite(event.id, STRANGER);
    await demoRepo.joinEventViaInvite(event.id, STRANGER);

    const detail = await demoRepo.getEvent(event.id);
    expect(
      detail?.invitees.filter((i) => i.user_id === STRANGER)
    ).toHaveLength(1);
  });
});

describe("event visibility", () => {
  it("shows an event to its host", async () => {
    const event = await makeEvent();
    const events = await demoRepo.listEvents(DEMO_USER_ID);

    expect(events.map((e) => e.id)).toContain(event.id);
  });

  it("shows an event to someone explicitly invited", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_B] });
    const events = await demoRepo.listEvents(DEMO_TEAMMATE_B);

    expect(events.map((e) => e.id)).toContain(event.id);
  });

  it("shows a kaki-linked event to every member", async () => {
    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Visible group");
    await demoRepo.joinKaki(kaki.invite_token, DEMO_TEAMMATE_A);
    const event = await makeEvent({ kakiId: kaki.id });

    const events = await demoRepo.listEvents(DEMO_TEAMMATE_A);
    expect(events.map((e) => e.id)).toContain(event.id);
  });

  it("hides an unrelated event from a stranger", async () => {
    const event = await makeEvent();
    const events = await demoRepo.listEvents(STRANGER);

    expect(events.map((e) => e.id)).not.toContain(event.id);
  });
});

describe("closing", () => {
  it("stops anyone but the host closing it", async () => {
    const event = await makeEvent();

    await expect(
      demoRepo.closeEvent(event.id, DEMO_TEAMMATE_A)
    ).rejects.toThrow(/only the host/i);
  });

  it("picks the Borda winner when no override is given", async () => {
    const event = await makeEvent({
      placeIds: ["demo-place-01", "demo-place-02"],
    });
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-02",
      "demo-place-01",
    ]);

    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    expect(closed.status).toBe("closed");
    expect(closed.winner_place_id).toBe("demo-place-02");
  });

  it("honours a host override, which is how the roulette closes", async () => {
    const event = await makeEvent({
      placeIds: ["demo-place-01", "demo-place-02"],
    });
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-02"]);

    const closed = await demoRepo.closeEvent(
      event.id,
      DEMO_USER_ID,
      "demo-place-01"
    );

    expect(closed.winner_place_id).toBe("demo-place-01");
  });

  it("closes with no winner when nobody voted", async () => {
    const event = await makeEvent();
    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    expect(closed.status).toBe("closed");
    expect(closed.winner_place_id).toBeNull();
  });
});

describe("vote push throttle (claimVotePushWindow)", () => {
  // 038_vote_push_throttle.sql — one push per event per window, not a true
  // debounce. See the migration's comment for why (Vercel Hobby's cron is
  // nowhere near frequent enough to wait out a quiet period).
  it("claims the window on the first call", async () => {
    const event = await makeEvent();
    expect(await demoRepo.claimVotePushWindow(event.id)).toBe(true);
  });

  it("refuses a second claim within the same window", async () => {
    const event = await makeEvent();
    await demoRepo.claimVotePushWindow(event.id);
    expect(await demoRepo.claimVotePushWindow(event.id)).toBe(false);
  });

  it("respects a custom window length", async () => {
    const event = await makeEvent();
    await demoRepo.claimVotePushWindow(event.id, 600);
    // A 0-second window is already expired by the time this second call
    // runs, however little time has actually passed.
    expect(await demoRepo.claimVotePushWindow(event.id, 0)).toBe(true);
  });

  it("returns false for an event that does not exist", async () => {
    expect(await demoRepo.claimVotePushWindow("no-such-event")).toBe(false);
  });
});

describe("starting-soon reminder (remindDueEvents)", () => {
  // 039_close_reminder.sql — lazy, page-load-triggered, same shape as
  // generateDueOccurrences. "Close" was redefined as "the Jio's own
  // scheduled_at" since there is no separate poll deadline anywhere.
  function inMinutes(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  async function makeSoonEvent(options?: {
    minutesAway?: number;
    inviteeIds?: string[];
  }) {
    return demoRepo.createEvent(
      DEMO_USER_ID,
      "Starting soon lunch",
      inMinutes(options?.minutesAway ?? 20),
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      options?.inviteeIds ?? []
    );
  }

  it("nudges an invitee who has not voted or RSVP'd, inside the window", async () => {
    const event = await makeSoonEvent({ inviteeIds: [DEMO_TEAMMATE_A] });

    const due = await demoRepo.remindDueEvents(DEMO_USER_ID);

    expect(due).toHaveLength(1);
    expect(due[0].eventId).toBe(event.id);
    expect(due[0].recipientIds).toContain(DEMO_TEAMMATE_A);
    expect(due[0].recipientIds).toContain(DEMO_USER_ID); // host hasn't voted either
  });

  it("excludes anyone who already voted or RSVP'd", async () => {
    const event = await makeSoonEvent({
      inviteeIds: [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B],
    });
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "yes");

    const [due] = await demoRepo.remindDueEvents(DEMO_USER_ID);

    expect(due.recipientIds).not.toContain(DEMO_TEAMMATE_A);
    expect(due.recipientIds).not.toContain(DEMO_TEAMMATE_B);
    expect(due.recipientIds).toContain(DEMO_USER_ID);
  });

  it("ignores an event more than 30 minutes away", async () => {
    await makeSoonEvent({ minutesAway: 90 });
    expect(await demoRepo.remindDueEvents(DEMO_USER_ID)).toHaveLength(0);
  });

  it("ignores an event that already happened", async () => {
    await makeSoonEvent({ minutesAway: -10 });
    expect(await demoRepo.remindDueEvents(DEMO_USER_ID)).toHaveLength(0);
  });

  it("only ever fires once per event", async () => {
    await makeSoonEvent({ inviteeIds: [DEMO_TEAMMATE_A] });

    const first = await demoRepo.remindDueEvents(DEMO_USER_ID);
    const second = await demoRepo.remindDueEvents(DEMO_USER_ID);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("skips a Flexi Jio still polling for a date", async () => {
    // Ten days apart, not one — inMinutes(20) and inMinutes(60 * 24) can
    // land on the same calendar date whenever "now" is within 20 minutes
    // of midnight, deduplicating to a single candidate and failing
    // createFlexiEvent's "needs at least 2" check for reasons that have
    // nothing to do with what this test is actually checking.
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Flexi lunch",
      DEFAULT_OFFICE.id,
      [inMinutes(20).slice(0, 10), inMinutes(60 * 24 * 10).slice(0, 10)],
      null,
      [DEMO_TEAMMATE_A]
    );
    expect(event.date_phase).toBe("polling");

    expect(await demoRepo.remindDueEvents(DEMO_USER_ID)).toHaveLength(0);
  });
});

describe("ballots", () => {
  it("replaces a previous ballot rather than appending to it", async () => {
    const event = await makeEvent({
      placeIds: ["demo-place-01", "demo-place-02"],
    });

    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-01",
      "demo-place-02",
    ]);
    await demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-02"]);

    const detail = await demoRepo.getEvent(event.id);
    const mine = detail?.votes.filter((v) => v.user_id === DEMO_USER_ID) ?? [];

    expect(mine).toHaveLength(1);
    expect(mine[0].place_id).toBe("demo-place-02");
  });

  it("ignores ranked places that are not options", async () => {
    const event = await makeEvent({ placeIds: ["demo-place-01"] });
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      "demo-place-01",
      "demo-place-99",
    ]);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.votes).toHaveLength(1);
  });

  it("rejects a ballot on a closed event", async () => {
    const event = await makeEvent();
    await demoRepo.closeEvent(event.id, DEMO_USER_ID);

    await expect(
      demoRepo.castBallot(event.id, DEMO_USER_ID, ["demo-place-01"])
    ).rejects.toThrow(/already closed/i);
  });
});
