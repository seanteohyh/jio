import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260821c.md §1 — the configurable "starting soon" reminder.
 * Deliberately a different feature from the existing non-responder nudge
 * (see eventAdditions.test.ts's reminder-window coverage): confirmed-going
 * only, per-person lead time, one-shot per (event, user) rather than per
 * event.
 */

beforeEach(() => {
  resetDemoStore();
});

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function makeEvent(scheduledAt: string) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    scheduledAt,
    DEFAULT_OFFICE.id,
    ["demo-place-01"],
    null,
    []
  );
}

describe("event reminder override", () => {
  it("has no override by default", async () => {
    const event = await makeEvent(minutesFromNow(60));
    expect(
      await demoRepo.getEventReminderOverride(event.id, DEMO_TEAMMATE_A)
    ).toBeNull();
  });

  it("sets and reads back a per-Jio override", async () => {
    const event = await makeEvent(minutesFromNow(60));
    await demoRepo.setEventReminderOverride(event.id, DEMO_TEAMMATE_A, 15);
    expect(
      await demoRepo.getEventReminderOverride(event.id, DEMO_TEAMMATE_A)
    ).toBe(15);
  });

  it("clears an override back to null", async () => {
    const event = await makeEvent(minutesFromNow(60));
    await demoRepo.setEventReminderOverride(event.id, DEMO_TEAMMATE_A, 15);
    await demoRepo.setEventReminderOverride(event.id, DEMO_TEAMMATE_A, null);
    expect(
      await demoRepo.getEventReminderOverride(event.id, DEMO_TEAMMATE_A)
    ).toBeNull();
  });

  it("keeps each person's override independent", async () => {
    const event = await makeEvent(minutesFromNow(60));
    await demoRepo.setEventReminderOverride(event.id, DEMO_TEAMMATE_A, 15);
    await demoRepo.setEventReminderOverride(event.id, DEMO_TEAMMATE_B, 120);
    expect(
      await demoRepo.getEventReminderOverride(event.id, DEMO_TEAMMATE_A)
    ).toBe(15);
    expect(
      await demoRepo.getEventReminderOverride(event.id, DEMO_TEAMMATE_B)
    ).toBe(120);
  });
});

describe("listAndClaimDueReminders", () => {
  it("fires for a confirmed-going attendee once within their default lead time", async () => {
    const event = await makeEvent(minutesFromNow(25)); // default lead is 30
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");

    const due = await demoRepo.listAndClaimDueReminders();
    expect(due).toEqual([
      {
        eventId: event.id,
        userId: DEMO_TEAMMATE_A,
        title: "Test lunch",
        scheduledAt: event.scheduled_at,
      },
    ]);
  });

  it("does not fire before the lead time window", async () => {
    const event = await makeEvent(minutesFromNow(45)); // outside the 30-min default
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");

    expect(await demoRepo.listAndClaimDueReminders()).toEqual([]);
  });

  it("ignores someone who hasn't RSVP'd yes", async () => {
    const event = await makeEvent(minutesFromNow(5));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "maybe");

    expect(await demoRepo.listAndClaimDueReminders()).toEqual([]);
  });

  it("only fires once per (event, user)", async () => {
    const event = await makeEvent(minutesFromNow(5));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");

    const first = await demoRepo.listAndClaimDueReminders();
    expect(first).toHaveLength(1);

    const second = await demoRepo.listAndClaimDueReminders();
    expect(second).toEqual([]);
  });

  it("respects a per-Jio override over the default lead time", async () => {
    // 45 minutes away is outside the 30-min default, but inside a 60-min override.
    const event = await makeEvent(minutesFromNow(45));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.setEventReminderOverride(event.id, DEMO_TEAMMATE_A, 60);

    const due = await demoRepo.listAndClaimDueReminders();
    expect(due).toHaveLength(1);
    expect(due[0].userId).toBe(DEMO_TEAMMATE_A);
  });

  it("skips someone who has turned reminders off", async () => {
    const event = await makeEvent(minutesFromNow(5));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    const prefs = await demoRepo.getUserPrefs(DEMO_TEAMMATE_A);
    await demoRepo.upsertUserPrefs({
      ...(prefs ?? {
        user_id: DEMO_TEAMMATE_A,
        cuisine_likes: [],
        cuisine_dislikes: [],
        budget_min: 1,
        budget_max: 6,
        blocklist: [],
        default_office_id: null,
        reminder_lead_minutes: 30,
      }),
      reminders_enabled: false,
    });

    expect(await demoRepo.listAndClaimDueReminders()).toEqual([]);
  });

  it("skips a cancelled Jio", async () => {
    const event = await makeEvent(minutesFromNow(5));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.cancelEvent(event.id, DEMO_USER_ID);

    expect(await demoRepo.listAndClaimDueReminders()).toEqual([]);
  });

  it("skips a Jio whose scheduled time has already passed", async () => {
    const event = await makeEvent(minutesFromNow(-5));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");

    expect(await demoRepo.listAndClaimDueReminders()).toEqual([]);
  });

  it("still fires for someone with no user_prefs row at all, using the column defaults", async () => {
    const STRANGER = "00000000-0000-0000-0000-0000000strngr";
    const event = await makeEvent(minutesFromNow(5));
    await demoRepo.rsvp(event.id, STRANGER, "yes");
    expect(await demoRepo.getUserPrefs(STRANGER)).toBeNull();

    const due = await demoRepo.listAndClaimDueReminders();
    expect(due).toHaveLength(1);
    expect(due[0].userId).toBe(STRANGER);
  });

  it("does not fire for a Jio still well outside anyone's window", async () => {
    const event = await makeEvent(minutesFromNow(60 * 24));
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");

    expect(await demoRepo.listAndClaimDueReminders()).toEqual([]);
  });
});
