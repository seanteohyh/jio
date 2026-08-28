import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * CHANGES_20260821_combined2.md §3A — the signed-out preview at
 * `/e/[token]`. `getPublicEventPreview` is the one repo method a visitor
 * with no session can call, so it's the one place a leak of votes,
 * invitee identities, or per-person RSVPs would show up.
 */

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

describe("getPublicEventPreview", () => {
  it("returns null for a token that does not exist", async () => {
    expect(await demoRepo.getPublicEventPreview("no-such-token")).toBeNull();
  });

  it("returns the safe subset for a real event", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);

    const preview = await demoRepo.getPublicEventPreview(event.invite_token);

    expect(preview).toMatchObject({
      title: "Test lunch",
      hostName: "You",
      status: "open",
    });
    expect(preview?.placeOptions).toHaveLength(2);
    expect(preview?.placeOptions.map((o) => o.name).sort()).toEqual(
      ["Albert Centre Market & Food Centre", "Hill Street Tai Hwa Pork Noodle"].sort()
    );
  });

  it("only counts confirmed 'yes' RSVPs toward goingCount", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]);
    await demoRepo.rsvp(event.id, DEMO_USER_ID, "yes");
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "maybe");
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_B, "no");

    const preview = await demoRepo.getPublicEventPreview(event.invite_token);
    expect(preview?.goingCount).toBe(1);
  });

  it("never exposes votes, invitees, or per-person RSVPs", async () => {
    const event = await makeEvent([DEMO_TEAMMATE_A]);
    await demoRepo.rsvp(event.id, DEMO_TEAMMATE_A, "yes");
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, ["demo-place-01"]);

    const preview = await demoRepo.getPublicEventPreview(event.invite_token);

    expect(preview).not.toHaveProperty("votes");
    expect(preview).not.toHaveProperty("tally");
    expect(preview).not.toHaveProperty("invitees");
    expect(preview).not.toHaveProperty("rsvps");
    // Place options are plain names — no vote counts or added_by attribution.
    for (const option of preview?.placeOptions ?? []) {
      expect(Object.keys(option).sort()).toEqual(["id", "name"]);
    }
  });

  it("is unaffected by a Jio's hide_votes setting — always redacted regardless", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Hidden ballot lunch",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      [],
      true
    );

    const preview = await demoRepo.getPublicEventPreview(event.invite_token);
    expect(preview).not.toHaveProperty("tally");
  });
});
