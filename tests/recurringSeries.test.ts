import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";
import type { RecurringSeries } from "@/types";

/**
 * Recurring Jios — the perpetual-series follow-up to CHANGES_20260801.md
 * §10. A series is a generator, not an event: `generateDueOccurrences` turns
 * it into an ordinary `LunchEvent` via the same `createEvent` every other
 * Jio uses, which is what these tests are really checking — that the
 * generated occurrence is indistinguishable from one a host made by hand,
 * plus the date math and idempotency around *when* that happens.
 *
 * A Wednesday is used throughout because it's mid-week enough that "the
 * next Wednesday" and "today, if today is Wednesday" both stay inside a
 * single fake-timers `setSystemTime` without wrapping a month boundary.
 */

function seriesInput(
  overrides: Partial<
    Omit<RecurringSeries, "id" | "status" | "last_generated_date" | "created_at">
  > = {}
) {
  return {
    host_id: DEMO_USER_ID,
    title: "Standing Wednesday lunch",
    office_id: DEFAULT_OFFICE.id,
    kaki_id: null,
    invitee_ids: [] as string[],
    weekday: 3, // Wednesday
    time_of_day: "12:15",
    mode: "fixed" as const,
    fixed_place_id: "demo-place-01",
    option_place_ids: [] as string[],
    ...overrides,
  };
}

beforeEach(() => {
  resetDemoStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRecurringSeries / listRecurringSeries", () => {
  it("creates a series and lists it back for its host", async () => {
    await demoRepo.createRecurringSeries(seriesInput());
    const mine = await demoRepo.listRecurringSeries(DEMO_USER_ID);

    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("active");
    expect(mine[0].fixed_place_name).toBeTruthy();
  });

  it("does not list another host's series", async () => {
    await demoRepo.createRecurringSeries(
      seriesInput({ host_id: DEMO_TEAMMATE_A })
    );
    const mine = await demoRepo.listRecurringSeries(DEMO_USER_ID);
    expect(mine).toHaveLength(0);
  });
});

describe("cancelRecurringSeries", () => {
  it("lets the host cancel", async () => {
    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.cancelRecurringSeries(series.id, DEMO_USER_ID);

    const mine = await demoRepo.listRecurringSeries(DEMO_USER_ID);
    expect(mine[0].status).toBe("cancelled");
  });

  it("refuses anyone but the host", async () => {
    const series = await demoRepo.createRecurringSeries(seriesInput());
    await expect(
      demoRepo.cancelRecurringSeries(series.id, DEMO_TEAMMATE_A)
    ).rejects.toThrow();
  });
});

describe("generateDueOccurrences", () => {
  it("generates a fixed-mode occurrence with exactly one option", async () => {
    // A Wednesday, so weekday 3 is due today (0 days away).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00")); // a Wednesday

    await demoRepo.createRecurringSeries(seriesInput());
    const count = await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    expect(count).toBe(1);

    const events = await demoRepo.listEvents(DEMO_USER_ID);
    const generated = events.find((e) => e.recurring_series_id);
    expect(generated).toBeDefined();

    const detail = await demoRepo.getEvent(generated!.id);
    expect(detail?.options).toHaveLength(1);
    expect(detail?.options[0].place_id).toBe("demo-place-01");
  });

  it("generates a vote-mode occurrence with the configured option pool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00"));

    await demoRepo.createRecurringSeries(
      seriesInput({
        mode: "vote",
        fixed_place_id: null,
        option_place_ids: ["demo-place-01", "demo-place-02"],
      })
    );
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);

    const events = await demoRepo.listEvents(DEMO_USER_ID);
    const generated = events.find((e) => e.recurring_series_id);
    const detail = await demoRepo.getEvent(generated!.id);
    expect(detail?.options.map((o) => o.place_id).sort()).toEqual([
      "demo-place-01",
      "demo-place-02",
    ]);
  });

  it("does not generate when the next occurrence is outside the lookahead window", async () => {
    // A Thursday: next Wednesday is 6 days out, past the 3-day window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T09:00:00")); // a Thursday

    await demoRepo.createRecurringSeries(seriesInput());
    const count = await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    expect(count).toBe(0);
  });

  it("does not regenerate the same occurrence twice", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00"));

    await demoRepo.createRecurringSeries(seriesInput());
    const first = await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const second = await demoRepo.generateDueOccurrences(DEMO_USER_ID);

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it("does not generate for a cancelled series", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00"));

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.cancelRecurringSeries(series.id, DEMO_USER_ID);

    const count = await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    expect(count).toBe(0);
  });

  it("generates the configured time as its Singapore instant, not the runtime's own local hour", async () => {
    // CHANGES_20260819b.md §2 — `time_of_day` is meant as Singapore local
    // time; the bug wrote it as the runtime's own (UTC, on Vercel) local
    // hour instead, so "12:00" was stored as 12:00 UTC (8pm SGT) rather
    // than 04:00 UTC (12:00 SGT).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z")); // Wed, 9am UTC = 5pm SGT

    await demoRepo.createRecurringSeries(
      seriesInput({ time_of_day: "12:00" })
    );
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);

    const events = await demoRepo.listEvents(DEMO_USER_ID);
    const generated = events.find((e) => e.recurring_series_id);
    expect(generated?.scheduled_at).toBe("2026-08-05T04:00:00.000Z");
  });

  it("treats 'today' as Singapore's calendar day, not UTC's, right after UTC midnight", async () => {
    // 2026-08-05T20:00:00Z is already Thursday, 4am in Singapore, even
    // though it's still Wednesday in UTC. A series recurring on Wednesday
    // should not treat "today" as still being that Wednesday — in
    // Singapore terms it already passed, so the next real occurrence
    // (Aug 12) is 6 days out, past the 3-day lookahead window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T20:00:00Z"));

    await demoRepo.createRecurringSeries(seriesInput({ weekday: 3 })); // Wednesday
    const count = await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    expect(count).toBe(0);
  });

  it("expands invitees fresh from current kaki membership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00"));

    const kaki = await demoRepo.createKaki(DEMO_USER_ID, "Standing lunch crew");
    await demoRepo.joinKaki(kaki.invite_token, DEMO_TEAMMATE_A);

    await demoRepo.createRecurringSeries(
      seriesInput({ kaki_id: kaki.id })
    );
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);

    const events = await demoRepo.listEvents(DEMO_USER_ID);
    const generated = events.find((e) => e.recurring_series_id);
    const detail = await demoRepo.getEvent(generated!.id);
    expect(detail?.invitees.map((i) => i.user_id)).toContain(DEMO_TEAMMATE_A);

    // Someone joining the kaki *after* this occurrence generates should not
    // be retroactively added to it — the snapshot on the generated event is
    // frozen the normal way; only the *next* occurrence picks up new members.
    await demoRepo.joinKaki(kaki.invite_token, DEMO_TEAMMATE_B);
    const stillOnlyOriginal = await demoRepo.getEvent(generated!.id);
    expect(
      stillOnlyOriginal?.invitees.map((i) => i.user_id)
    ).not.toContain(DEMO_TEAMMATE_B);
  });
});

describe("updateRecurringSeries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the host update the series' own fields", async () => {
    const series = await demoRepo.createRecurringSeries(seriesInput());
    const updated = await demoRepo.updateRecurringSeries(
      series.id,
      DEMO_USER_ID,
      { title: "New name", time_of_day: "13:00" }
    );
    expect(updated.title).toBe("New name");
    expect(updated.time_of_day).toBe("13:00");
    // Untouched fields keep their original value.
    expect(updated.weekday).toBe(3);
  });

  it("refuses anyone but the host", async () => {
    const series = await demoRepo.createRecurringSeries(seriesInput());
    await expect(
      demoRepo.updateRecurringSeries(series.id, DEMO_TEAMMATE_A, {
        title: "Hijacked",
      })
    ).rejects.toThrow();
  });

  it("propagates a time change onto a still-open generated occurrence, same date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z")); // Wed, 9am UTC

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;
    expect(before.scheduled_at).toBe("2026-08-05T04:15:00.000Z"); // 12:15 SGT

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      time_of_day: "14:00",
    });

    const after = await demoRepo.getEvent(before.id);
    // Same calendar date, new time (14:00 SGT = 06:00 UTC).
    expect(after?.scheduled_at).toBe("2026-08-05T06:00:00.000Z");
  });

  it("never moves an already-generated occurrence's date when the weekday changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z")); // Wed

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      weekday: 4, // Thursday, from now on
    });

    const after = await demoRepo.getEvent(before.id);
    // Still Wednesday, Aug 5 — the weekday edit only affects future
    // occurrences, not this already-generated one.
    expect(after?.scheduled_at.slice(0, 10)).toBe("2026-08-05");
  });

  it("propagates a place/mode change onto a still-open occurrence nobody's responded to", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z"));

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      mode: "vote",
      fixed_place_id: null,
      option_place_ids: ["demo-place-01", "demo-place-02"],
    });

    const after = await demoRepo.getEvent(before.id);
    expect(after?.options.map((o) => o.place_id).sort()).toEqual([
      "demo-place-01",
      "demo-place-02",
    ]);
  });

  it("does not touch a still-open occurrence's options once a ballot's been cast", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z"));

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;
    await demoRepo.castBallot(before.id, DEMO_TEAMMATE_A, ["demo-place-01"]);

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      mode: "vote",
      fixed_place_id: null,
      option_place_ids: ["demo-place-01", "demo-place-02"],
    });

    const after = await demoRepo.getEvent(before.id);
    expect(after?.options.map((o) => o.place_id)).toEqual(["demo-place-01"]);
  });

  it("does not touch a still-open occurrence's options once an RSVP's been cast", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z"));

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;
    await demoRepo.rsvp(before.id, DEMO_TEAMMATE_A, "yes");

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      mode: "vote",
      fixed_place_id: null,
      option_place_ids: ["demo-place-01", "demo-place-02"],
    });

    const after = await demoRepo.getEvent(before.id);
    expect(after?.options.map((o) => o.place_id)).toEqual(["demo-place-01"]);
  });

  it("propagates an invitee list change onto a still-open occurrence nobody's responded to", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z"));

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      invitee_ids: [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B],
    });

    const after = await demoRepo.getEvent(before.id);
    expect(after?.invitees.map((i) => i.user_id).sort()).toEqual(
      [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B].sort()
    );
  });

  it("leaves a closed occurrence untouched by any edit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T09:00:00Z"));

    const series = await demoRepo.createRecurringSeries(seriesInput());
    await demoRepo.generateDueOccurrences(DEMO_USER_ID);
    const before = (await demoRepo.listEvents(DEMO_USER_ID)).find(
      (e) => e.recurring_series_id === series.id
    )!;
    await demoRepo.closeEvent(before.id, DEMO_USER_ID, "demo-place-01");

    await demoRepo.updateRecurringSeries(series.id, DEMO_USER_ID, {
      time_of_day: "18:00",
      mode: "vote",
      fixed_place_id: null,
      option_place_ids: ["demo-place-01", "demo-place-02"],
    });

    const after = await demoRepo.getEvent(before.id);
    expect(after?.scheduled_at).toBe(before.scheduled_at);
    expect(after?.options.map((o) => o.place_id)).toEqual(["demo-place-01"]);
  });
});
