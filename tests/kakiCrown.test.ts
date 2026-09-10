import { describe, expect, it } from "vitest";
import { resolveKakiAwardCrown } from "@/lib/kakiCrown";

describe("resolveKakiAwardCrown", () => {
  it("returns null when nobody has any value for this award", () => {
    expect(resolveKakiAwardCrown("k1", "2026-01-01", [], [])).toBeNull();
  });

  it("crowns the raw #1 normally when they're not #1 anywhere else", () => {
    const result = resolveKakiAwardCrown(
      "k1",
      "2026-01-01",
      [
        { user_id: "ahmad", value: 14 },
        { user_id: "priya", value: 5 },
      ],
      []
    );
    expect(result).toEqual({
      user_id: "ahmad",
      value: 14,
      streak: 1,
      passedNote: null,
    });
  });

  it("crowns the winner here (with a streak) when this is their best group", () => {
    // Priya is #1 on Most Active in both her kakis; Weekend Foodies (this
    // one) is her best at 14 visits vs. 9 in Office Lunch Crew — matches
    // the log's own worked example.
    const result = resolveKakiAwardCrown(
      "weekend-foodies",
      "2026-01-01",
      [
        { user_id: "priya", value: 14 },
        { user_id: "ahmad", value: 6 },
      ],
      [
        {
          kakiId: "office-lunch-crew",
          kakiName: "Office Lunch Crew",
          createdAt: "2026-02-01",
          value: 9,
        },
      ]
    );
    expect(result).toEqual({
      user_id: "priya",
      value: 14,
      streak: 2,
      passedNote: null,
    });
  });

  it("passes the crown to the runner-up when a different kaki is the winner's home", () => {
    const result = resolveKakiAwardCrown(
      "office-lunch-crew",
      "2026-02-01",
      [
        { user_id: "priya", value: 9 },
        { user_id: "ahmad", value: 7 },
      ],
      [
        {
          kakiId: "weekend-foodies",
          kakiName: "Weekend Foodies",
          createdAt: "2026-01-01",
          value: 14,
        },
      ]
    );
    expect(result).toEqual({
      user_id: "ahmad",
      value: 7,
      streak: 1,
      passedNote: {
        leaderUserId: "priya",
        leaderValue: 9,
        homeKakiName: "Weekend Foodies",
      },
    });
  });

  it("returns null when the crown would pass but there's no runner-up to receive it", () => {
    const result = resolveKakiAwardCrown(
      "office-lunch-crew",
      "2026-02-01",
      [{ user_id: "priya", value: 9 }],
      [
        {
          kakiId: "weekend-foodies",
          kakiName: "Weekend Foodies",
          createdAt: "2026-01-01",
          value: 14,
        },
      ]
    );
    expect(result).toBeNull();
  });

  it("breaks a tie between equal-value homes by earliest-created kaki", () => {
    const result = resolveKakiAwardCrown(
      "later-kaki",
      "2026-03-01",
      [
        { user_id: "priya", value: 10 },
        { user_id: "ahmad", value: 3 },
      ],
      [
        {
          kakiId: "earlier-kaki",
          kakiName: "Earlier Kaki",
          createdAt: "2026-01-01",
          value: 10,
        },
      ]
    );
    // Equal value (10 vs 10) — the earlier-created kaki wins the tie, so
    // this (later-created) kaki passes its crown to the runner-up.
    expect(result?.user_id).toBe("ahmad");
    expect(result?.passedNote?.homeKakiName).toBe("Earlier Kaki");
  });
});
