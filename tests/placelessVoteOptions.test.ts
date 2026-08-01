import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * "Vote first, prompt after" — CHANGES_20260801.md §8.
 *
 * A free-text option has no `places` row: `place_id` is a generated id that
 * matches nothing, and `label` is what marks it as a draft. The point of
 * these tests is that this stays compatible with plain ranked voting (no
 * schema fork, no separate tally code path) and that attaching a real place
 * afterward doesn't strand votes already cast for the draft.
 */

const STRANGER = "00000000-0000-0000-0000-0000000stranger";
const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

async function makeEvent() {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01"],
    null,
    [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]
  );
}

describe("addFreeTextOptionToEvent", () => {
  it("logs a votable option with no place record", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_USER_ID
    );

    expect(option.label).toBe("abc house");
    expect(option.place_id).toBeTruthy();

    const detail = await demoRepo.getEvent(event.id);
    const found = detail?.options.find((o) => o.place_id === option.place_id);
    expect(found?.label).toBe("abc house");
    expect(found?.place).toBeUndefined();
  });

  it("refuses someone who isn't host, kaki member or invitee", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.addFreeTextOptionToEvent(event.id, "abc house", STRANGER)
    ).rejects.toThrow();
  });

  it("refuses a blank label", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.addFreeTextOptionToEvent(event.id, "   ", DEMO_USER_ID)
    ).rejects.toThrow();
  });

  it("counts toward the tally exactly like a real place would", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_TEAMMATE_A
    );

    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, [option.place_id]);
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_B, [
      option.place_id,
      "demo-place-01",
    ]);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.tally?.[option.place_id]).toBeGreaterThan(0);
  });

  it("can win the vote outright, exposed as winner_label", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_USER_ID
    );

    await demoRepo.castBallot(event.id, DEMO_USER_ID, [option.place_id]);
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, [option.place_id]);

    const closed = await demoRepo.closeEvent(event.id, DEMO_USER_ID, null);

    expect(closed.winner_place_id).toBe(option.place_id);
    expect(closed.winner_place_name).toBeNull();
    expect(closed.winner_label).toBe("abc house");
  });
});

describe("attachPlaceToOption", () => {
  it("upgrades a free-text option to a real place", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_USER_ID
    );

    await demoRepo.attachPlaceToOption(
      event.id,
      option.place_id,
      "demo-place-02",
      DEMO_USER_ID
    );

    const detail = await demoRepo.getEvent(event.id);
    const upgraded = detail?.options.find((o) => o.place_id === "demo-place-02");
    expect(upgraded?.label).toBeFalsy();
    expect(upgraded?.place?.id).toBe("demo-place-02");
    expect(
      detail?.options.some((o) => o.place_id === option.place_id)
    ).toBe(false);
  });

  it("moves votes already cast for the draft option along with it", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_TEAMMATE_A
    );
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, [option.place_id]);
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_B, [option.place_id]);

    await demoRepo.attachPlaceToOption(
      event.id,
      option.place_id,
      "demo-place-02",
      DEMO_TEAMMATE_A
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.tally?.["demo-place-02"]).toBeGreaterThan(0);
    expect(detail?.tally?.[option.place_id]).toBeUndefined();
  });

  it("keeps a voter's separately-cast real-place vote instead of colliding", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_USER_ID
    );
    // Ranks both the draft and the real place it's about to become.
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [
      option.place_id,
      "demo-place-02",
    ]);

    await demoRepo.attachPlaceToOption(
      event.id,
      option.place_id,
      "demo-place-02",
      DEMO_USER_ID
    );

    const detail = await demoRepo.getEvent(event.id);
    const votesForPlace2 = detail?.votes.filter(
      (v) => v.user_id === DEMO_USER_ID && v.place_id === "demo-place-02"
    );
    expect(votesForPlace2).toHaveLength(1);
  });

  it("carries the winner forward if the draft option had already won", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_USER_ID
    );
    await demoRepo.castBallot(event.id, DEMO_USER_ID, [option.place_id]);
    await demoRepo.closeEvent(event.id, DEMO_USER_ID, option.place_id);

    await demoRepo.attachPlaceToOption(
      event.id,
      option.place_id,
      "demo-place-02",
      DEMO_USER_ID
    );

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.winner_place_id).toBe("demo-place-02");
    expect(detail?.winner_place_name).toBeTruthy();
  });

  it("refuses to attach a place to an option that already has one", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.attachPlaceToOption(
        event.id,
        "demo-place-01",
        "demo-place-02",
        DEMO_USER_ID
      )
    ).rejects.toThrow();
  });

  it("refuses someone who neither added the option nor hosts the Jio", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_TEAMMATE_A
    );

    await expect(
      demoRepo.attachPlaceToOption(
        event.id,
        option.place_id,
        "demo-place-02",
        DEMO_TEAMMATE_B
      )
    ).rejects.toThrow();
  });

  it("lets the host attach even if someone else added the option", async () => {
    const event = await makeEvent();
    const option = await demoRepo.addFreeTextOptionToEvent(
      event.id,
      "abc house",
      DEMO_TEAMMATE_A
    );

    await expect(
      demoRepo.attachPlaceToOption(
        event.id,
        option.place_id,
        "demo-place-02",
        DEMO_USER_ID
      )
    ).resolves.not.toThrow();
  });
});
