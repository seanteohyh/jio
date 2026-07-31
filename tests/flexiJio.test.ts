import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * Flexi Jio: a second event type where the date itself is polled before
 * place voting starts. Worth guarding: the 2-candidate-date minimum, that
 * marking availability replaces rather than adds to a prior selection, that
 * only the host can confirm (and only onto an actual candidate), and that a
 * regular (non-Flexi) event's date_phase stays untouched throughout.
 */

const DATE_A = "2026-08-10";
const DATE_B = "2026-08-11";
const DATE_C = "2026-08-12";

beforeEach(() => {
  resetDemoStore();
});

describe("Flexi Jio", () => {
  it("refuses fewer than 2 candidate dates", async () => {
    await expect(
      demoRepo.createFlexiEvent(DEMO_USER_ID, "Lunch", DEFAULT_OFFICE.id, [DATE_A])
    ).rejects.toThrow(/at least 2/i);
  });

  it("starts in the polling phase with a provisional scheduled_at", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Team lunch",
      DEFAULT_OFFICE.id,
      [DATE_B, DATE_A] // deliberately out of order
    );

    expect(event.date_phase).toBe("polling");
    // The earliest of the given dates, regardless of input order.
    expect(event.scheduled_at).toBe(DATE_A);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.candidateDates.map((d) => d.date)).toEqual([DATE_A, DATE_B]);
  });

  it("a regular Jio's date_phase is untouched", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Regular lunch",
      new Date().toISOString(),
      DEFAULT_OFFICE.id,
      []
    );
    expect(event.date_phase ?? null).toBeNull();
  });

  it("marking availability replaces the prior selection rather than adding to it", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B, DATE_C]
    );

    await demoRepo.markDateAvailability(event.id, DEMO_TEAMMATE_A, [DATE_A, DATE_B]);
    let detail = await demoRepo.getEvent(event.id);
    expect(
      detail?.dateVotes.filter((v) => v.user_id === DEMO_TEAMMATE_A).map((v) => v.date)
    ).toEqual(expect.arrayContaining([DATE_A, DATE_B]));

    // Re-marking with a different set fully replaces it.
    await demoRepo.markDateAvailability(event.id, DEMO_TEAMMATE_A, [DATE_C]);
    detail = await demoRepo.getEvent(event.id);
    const mine = detail?.dateVotes.filter((v) => v.user_id === DEMO_TEAMMATE_A);
    expect(mine?.map((v) => v.date)).toEqual([DATE_C]);
  });

  it("ignores a date that was never a candidate", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B]
    );

    await demoRepo.markDateAvailability(event.id, DEMO_USER_ID, [
      DATE_A,
      "2099-01-01",
    ]);
    const detail = await demoRepo.getEvent(event.id);
    const mine = detail?.dateVotes.filter((v) => v.user_id === DEMO_USER_ID);
    expect(mine?.map((v) => v.date)).toEqual([DATE_A]);
  });

  it("only the host can confirm a date", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B]
    );

    await expect(
      demoRepo.confirmEventDate(event.id, DEMO_TEAMMATE_A, DATE_A)
    ).rejects.toThrow(/only the host/i);
  });

  it("refuses to confirm a date that was never a candidate", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B]
    );

    await expect(
      demoRepo.confirmEventDate(event.id, DEMO_USER_ID, "2099-01-01")
    ).rejects.toThrow(/never a candidate/i);
  });

  it("confirming moves the phase to confirmed and sets the real date", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B]
    );

    const confirmed = await demoRepo.confirmEventDate(event.id, DEMO_USER_ID, DATE_B);
    expect(confirmed.date_phase).toBe("confirmed");
    expect(confirmed.scheduled_at).toBe(DATE_B);

    // Once confirmed, phase 2 behaviour (adding places) works exactly like
    // a regular Jio — addOptionToEvent isn't gated on date_phase at all.
    await demoRepo.addOptionToEvent(event.id, "demo-place-01", DEMO_USER_ID);
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.options.map((o) => o.place_id)).toContain("demo-place-01");
  });

  it("refuses to confirm twice", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B]
    );
    await demoRepo.confirmEventDate(event.id, DEMO_USER_ID, DATE_A);

    await expect(
      demoRepo.confirmEventDate(event.id, DEMO_USER_ID, DATE_B)
    ).rejects.toThrow(/already confirmed/i);
  });

  it("only a participant can add a candidate date while polling", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B],
      null,
      [DEMO_TEAMMATE_A]
    );

    await expect(
      demoRepo.addCandidateDate(event.id, DATE_C, DEMO_TEAMMATE_B)
    ).rejects.toThrow(/host, kaki members or invitees/i);

    await demoRepo.addCandidateDate(event.id, DATE_C, DEMO_TEAMMATE_A);
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.candidateDates.map((d) => d.date)).toContain(DATE_C);
  });

  it("refuses to add a candidate date once confirmed", async () => {
    const event = await demoRepo.createFlexiEvent(
      DEMO_USER_ID,
      "Lunch",
      DEFAULT_OFFICE.id,
      [DATE_A, DATE_B]
    );
    await demoRepo.confirmEventDate(event.id, DEMO_USER_ID, DATE_A);

    await expect(
      demoRepo.addCandidateDate(event.id, DATE_C, DEMO_USER_ID)
    ).rejects.toThrow(/already confirmed/i);
  });
});
