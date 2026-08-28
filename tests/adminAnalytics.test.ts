import { describe, expect, it } from "vitest";
import {
  bucketByDay,
  bucketByWeek,
  bucketDistinctUsersByDay,
  bucketDistinctUsersByMonth,
  bucketDistinctUsersByWeek,
  bucketWalkMinutes,
  isSameSgtDay,
  median,
  sgtDateKey,
  sgtMonthKey,
  sgtWeekKey,
} from "@/lib/adminAnalytics";

/**
 * §13 admin dashboard. Asia/Singapore has no DST, so a fixed +8h shift is
 * exact — these tests lean on times near the UTC day boundary specifically
 * because that's where a naive UTC bucketing would disagree with SGT.
 */
describe("sgtDateKey", () => {
  it("rolls a late-UTC timestamp into the next SGT day", () => {
    // 2026-03-05T20:00:00Z is 2026-03-06T04:00 in Singapore.
    expect(sgtDateKey("2026-03-05T20:00:00Z")).toBe("2026-03-06");
  });

  it("keeps an early-UTC timestamp on the same SGT day", () => {
    // 2026-03-05T02:00:00Z is 2026-03-05T10:00 in Singapore.
    expect(sgtDateKey("2026-03-05T02:00:00Z")).toBe("2026-03-05");
  });
});

describe("sgtWeekKey", () => {
  it("returns the Monday of the SGT week", () => {
    // Thursday 2026-03-05 in SGT falls in the week starting Monday 2026-03-02.
    expect(sgtWeekKey("2026-03-05T02:00:00Z")).toBe("2026-03-02");
  });

  it("treats Sunday as the last day of its week, not the first of the next", () => {
    // Sunday 2026-03-08 (SGT) belongs to the week starting Monday 2026-03-02.
    expect(sgtWeekKey("2026-03-08T02:00:00Z")).toBe("2026-03-02");
  });
});

describe("bucketByDay / bucketByWeek", () => {
  it("groups and sorts ascending by bucket", () => {
    const result = bucketByDay([
      "2026-03-05T02:00:00Z",
      "2026-03-05T05:00:00Z",
      "2026-03-04T02:00:00Z",
    ]);
    expect(result).toEqual([
      { date: "2026-03-04", count: 1 },
      { date: "2026-03-05", count: 2 },
    ]);
  });

  it("weekly bucketing collapses a whole week into one point", () => {
    const result = bucketByWeek([
      "2026-03-02T02:00:00Z", // Monday
      "2026-03-06T02:00:00Z", // Friday, same SGT week
    ]);
    expect(result).toEqual([{ date: "2026-03-02", count: 2 }]);
  });
});

describe("sgtMonthKey", () => {
  it("returns the 1st of the SGT month", () => {
    // 2026-03-05T02:00:00Z is 2026-03-05T10:00 in Singapore.
    expect(sgtMonthKey("2026-03-05T02:00:00Z")).toBe("2026-03-01");
  });

  it("rolls a late-UTC end-of-month timestamp into the next SGT month", () => {
    // 2026-02-28T20:00:00Z is 2026-03-01T04:00 in Singapore.
    expect(sgtMonthKey("2026-02-28T20:00:00Z")).toBe("2026-03-01");
  });
});

describe("bucketDistinctUsersByDay / Week / Month", () => {
  it("counts each user once per bucket, not once per event", () => {
    const result = bucketDistinctUsersByDay([
      { userId: "a", createdAt: "2026-03-05T02:00:00Z" },
      { userId: "a", createdAt: "2026-03-05T05:00:00Z" }, // same user, same SGT day
      { userId: "b", createdAt: "2026-03-05T03:00:00Z" },
      { userId: "a", createdAt: "2026-03-04T02:00:00Z" },
    ]);
    expect(result).toEqual([
      { date: "2026-03-04", count: 1 },
      { date: "2026-03-05", count: 2 },
    ]);
  });

  it("weekly bucketing collapses a whole week's distinct users into one point", () => {
    const result = bucketDistinctUsersByWeek([
      { userId: "a", createdAt: "2026-03-02T02:00:00Z" }, // Monday
      { userId: "b", createdAt: "2026-03-06T02:00:00Z" }, // Friday, same SGT week
      { userId: "a", createdAt: "2026-03-06T04:00:00Z" }, // repeat user, same week
    ]);
    expect(result).toEqual([{ date: "2026-03-02", count: 2 }]);
  });

  it("monthly bucketing collapses a whole month's distinct users into one point", () => {
    const result = bucketDistinctUsersByMonth([
      { userId: "a", createdAt: "2026-03-05T02:00:00Z" },
      { userId: "b", createdAt: "2026-03-20T02:00:00Z" },
      { userId: "a", createdAt: "2026-03-25T02:00:00Z" }, // repeat, same month
      { userId: "c", createdAt: "2026-04-01T02:00:00Z" },
    ]);
    expect(result).toEqual([
      { date: "2026-03-01", count: 2 },
      { date: "2026-04-01", count: 1 },
    ]);
  });

  it("returns an empty array for no activity", () => {
    expect(bucketDistinctUsersByDay([])).toEqual([]);
  });
});

describe("isSameSgtDay", () => {
  it("agrees across the UTC midnight boundary when SGT hasn't rolled yet", () => {
    // 2026-03-05T23:00Z and 2026-03-06T01:00Z straddle UTC midnight but are
    // both 2026-03-06 in Singapore (07:00 and 09:00 respectively).
    const reference = new Date("2026-03-06T01:00:00Z");
    expect(isSameSgtDay("2026-03-05T23:00:00Z", reference)).toBe(true);
  });

  it("disagrees once the SGT day has actually rolled", () => {
    const reference = new Date("2026-03-06T01:00:00Z");
    expect(isSameSgtDay("2026-03-04T23:00:00Z", reference)).toBe(false);
  });
});

describe("median", () => {
  it("returns null for no data rather than 0", () => {
    expect(median([])).toBeNull();
  });

  it("averages the two middle values for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the middle value for an odd count, unsorted input", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe("bucketWalkMinutes", () => {
  it("floors into the right bucket and skips missing walk times", () => {
    const result = bucketWalkMinutes([3, 7, 12, 18, 25, null, undefined]);
    expect(result).toEqual([
      { bucket: "0–5 min", count: 1 },
      { bucket: "5–10 min", count: 1 },
      { bucket: "10–15 min", count: 1 },
      { bucket: "15–20 min", count: 1 },
      { bucket: "20+ min", count: 1 },
    ]);
  });

  it("puts a boundary value in the lower bucket (inclusive max)", () => {
    const result = bucketWalkMinutes([5]);
    expect(result.find((b) => b.bucket === "0–5 min")?.count).toBe(1);
  });
});
