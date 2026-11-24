import { describe, expect, it } from "vitest";
import { inviteDescription, inviteShareText } from "@/lib/inviteShare";
import type { PublicEventPreview } from "@/types";

function makePreview(overrides: Partial<PublicEventPreview> = {}): PublicEventPreview {
  return {
    title: "Friday lunch",
    hostName: "Sean",
    scheduledAt: new Date().toISOString(),
    datePhase: "confirmed",
    status: "open",
    goingCount: 0,
    placeOptions: [],
    ...overrides,
  };
}

describe("inviteShareText", () => {
  it("leads with the ask and answers the signup objection", () => {
    const text = inviteShareText("Friday lunch");
    expect(text).toContain("Friday lunch");
    expect(text).toContain("vote on where we're eating");
    expect(text).toContain("no signup needed to peek");
  });
});

describe("inviteDescription", () => {
  it("summarizes an open Jio with host, going count and up to 3 options", () => {
    const text = inviteDescription(
      makePreview({
        hostName: "Sean",
        goingCount: 3,
        placeOptions: [
          { id: "1", name: "Kim San Leng" },
          { id: "2", name: "Ya Kun" },
          { id: "3", name: "Toast Box" },
          { id: "4", name: "Fourth Place" },
        ],
      })
    );
    expect(text).toContain("Hosted by Sean");
    expect(text).toContain("3 going so far");
    expect(text).toContain("Vote: Kim San Leng, Ya Kun, Toast Box");
    expect(text).not.toContain("Fourth Place");
  });

  it("says nobody's confirmed yet when going count is zero", () => {
    expect(inviteDescription(makePreview({ goingCount: 0 }))).toContain(
      "Nobody's confirmed yet"
    );
  });

  it("surfaces the decided place instead of vote state once closed", () => {
    const text = inviteDescription(
      makePreview({
        status: "closed",
        winnerPlaceName: "Kim San Leng",
        hostName: "Sean",
        goingCount: 5,
        placeOptions: [{ id: "1", name: "Kim San Leng" }],
      })
    );
    expect(text).toBe("Decided: Kim San Leng — hosted by Sean.");
  });
});
