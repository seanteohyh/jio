import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatTime,
  instagramSearchUrl,
  relativeDayLabel,
  sgtDateKey,
  sgtTimeOfDay,
  sgtToday,
  socialsHost,
  socialsLabel,
} from "@/lib/utils";

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

describe("sgtTimeOfDay", () => {
  it("reads the Singapore wall-clock time, not the raw UTC hour", () => {
    // 04:00 UTC is 12:00 in Singapore — the exact bug report (a Flexi Jio's
    // confirmed date reading "8:00 am" because its bare date string parsed
    // as UTC midnight).
    expect(sgtTimeOfDay("2026-08-27T04:00:00.000Z")).toBe("12:00");
  });
});

describe("sgtToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Singapore's calendar day, not UTC's, near the UTC day boundary", () => {
    // 2026-08-17T23:00:00Z is already 2026-08-18 in Singapore.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T23:00:00Z"));

    const today = sgtToday();
    expect(today.getFullYear()).toBe(2026);
    expect(today.getMonth()).toBe(7); // August, 0-indexed
    expect(today.getDate()).toBe(18);
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

/**
 * CHANGES_20260821b.md §1 — `socials_url` stores whatever full URL was
 * pasted, so the domain is sniffed at display time rather than requiring
 * one platform's own field.
 */
describe("socialsHost", () => {
  it("recognizes an Instagram profile link", () => {
    expect(socialsHost("https://www.instagram.com/somecafe")).toBe(
      "instagram"
    );
  });

  it("recognizes a Facebook page link, with or without www", () => {
    expect(socialsHost("https://facebook.com/somecafe")).toBe("facebook");
    expect(socialsHost("https://www.facebook.com/somecafe")).toBe("facebook");
  });

  it("falls back to 'other' for anything else", () => {
    expect(socialsHost("https://somecafe.example.com")).toBe("other");
  });

  it("falls back to 'other' rather than throwing on an unparseable URL", () => {
    expect(socialsHost("not a url")).toBe("other");
  });
});

describe("socialsLabel", () => {
  it("labels Instagram and Facebook links by name", () => {
    expect(socialsLabel("https://instagram.com/somecafe")).toBe(
      "View on Instagram"
    );
    expect(socialsLabel("https://facebook.com/somecafe")).toBe(
      "View on Facebook"
    );
  });

  it("uses a generic label for anything else", () => {
    expect(socialsLabel("https://somecafe.example.com")).toBe("View socials");
  });
});

describe("instagramSearchUrl", () => {
  it("builds an Instagram keyword-search link for the place's name", () => {
    expect(instagramSearchUrl("Ministry Of Food")).toBe(
      "https://www.instagram.com/explore/search/keyword/?q=Ministry%20Of%20Food"
    );
  });
});
