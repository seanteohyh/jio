import { describe, expect, it } from "vitest";
import { formatDate, formatTime, relativeDayLabel, sgtDateKey } from "@/lib/utils";

/**
 * CHANGES_20260818.md §4 — Home's Server Component renders on Vercel's UTC
 * clock, so any date/time formatting without an explicit `timeZone` (or any
 * day-boundary math using the runtime's own `getFullYear()`/`getMonth()`/
 * `getDate()`) silently used UTC instead of Singapore. These pin the fix:
 * every assertion below uses a timestamp chosen specifically so a
 * UTC-vs-SGT mixup would produce a visibly different answer.
 */

describe("formatTime", () => {
  it("renders in Singapore time regardless of the runtime's own timezone", () => {
    // 2026-08-18T04:00:00Z is 12:00 PM in Singapore — the exact bug report
    // (Jios tab showed "12:00 PM", Home showed "4:00 am").
    expect(formatTime("2026-08-18T04:00:00Z")).toMatch(/12:00\s*pm/i);
  });
});

describe("formatDate", () => {
  it("stays on the Singapore calendar day even just after UTC midnight", () => {
    // 2026-08-17T23:00:00Z is already 2026-08-18, 7:00 AM in Singapore.
    expect(formatDate("2026-08-17T23:00:00Z")).toContain("18 Aug");
  });
});

describe("sgtDateKey", () => {
  it("rolls a late-UTC timestamp into the next SGT day", () => {
    expect(sgtDateKey("2026-08-17T23:00:00Z")).toBe("2026-08-18");
  });
});

describe("relativeDayLabel", () => {
  it("agrees with Singapore's calendar, not UTC's, near the UTC day boundary", () => {
    // Reference "now" is 2026-08-17T23:30:00Z — already 2026-08-18, 7:30 AM
    // in Singapore. A Jio at 2026-08-18T04:00:00Z (12:00 PM SGT) is *today*
    // in Singapore, but a naive UTC comparison would see 2026-08-18 vs.
    // 2026-08-17 and call it "Tomorrow".
    const now = new Date("2026-08-17T23:30:00Z");
    expect(relativeDayLabel("2026-08-18T04:00:00Z", now)).toBe("Today");
  });

  it("still says Tomorrow once it genuinely is the next SGT day", () => {
    const now = new Date("2026-08-18T04:00:00Z"); // Today, noon SGT
    expect(relativeDayLabel("2026-08-19T04:00:00Z", now)).toBe("Tomorrow");
  });
});
