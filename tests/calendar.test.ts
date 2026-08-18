import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, isFullyDecided } from "@/lib/calendar";

/**
 * CHANGES_20260818.md §5 — "Add to calendar". Both the `.ics` file and the
 * Google Calendar link have to convert `scheduled_at` straight to UTC, not
 * through a locale-formatting call — §4 in the same log is exactly what
 * happens when that discipline slips, so these pin the UTC math
 * independent of whatever timezone the test runner happens to be in.
 */

const EVENT = {
  id: "evt-1",
  title: "Friday team lunch",
  scheduledAt: "2026-08-21T04:00:00.000Z", // 12:00 PM SGT
  location: "Din Tai Fung",
  description: "Hosted by Sean",
  url: "https://jio.example.com/e/abc123",
};

describe("buildIcs", () => {
  it("converts the instant straight to UTC, a fixed 1-hour duration later", () => {
    const ics = buildIcs(EVENT);
    expect(ics).toContain("DTSTART:20260821T040000Z");
    expect(ics).toContain("DTEND:20260821T050000Z");
  });

  it("includes the summary, location and description", () => {
    const ics = buildIcs(EVENT);
    expect(ics).toContain("SUMMARY:Friday team lunch");
    expect(ics).toContain("LOCATION:Din Tai Fung");
    expect(ics).toContain("DESCRIPTION:Hosted by Sean");
    expect(ics).toContain("URL:https://jio.example.com/e/abc123");
  });

  it("escapes commas, semicolons and newlines per RFC 5545", () => {
    const ics = buildIcs({
      ...EVENT,
      title: "Lunch, Round 2; Electric Boogaloo",
      description: "Line one\nLine two",
    });
    expect(ics).toContain("SUMMARY:Lunch\\, Round 2\\; Electric Boogaloo");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("uses CRLF line endings", () => {
    const ics = buildIcs(EVENT);
    expect(ics).toContain("\r\n");
    expect(ics.split("\r\n").some((line) => line.includes("\n"))).toBe(false);
  });
});

describe("googleCalendarUrl", () => {
  it("builds a one-tap TEMPLATE link with a matching UTC dates range", () => {
    const url = googleCalendarUrl(EVENT);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://calendar.google.com/calendar/render"
    );
    expect(parsed.searchParams.get("action")).toBe("TEMPLATE");
    expect(parsed.searchParams.get("dates")).toBe(
      "20260821T040000Z/20260821T050000Z"
    );
    expect(parsed.searchParams.get("text")).toBe("Friday team lunch");
    expect(parsed.searchParams.get("location")).toBe("Din Tai Fung");
  });
});

describe("isFullyDecided", () => {
  it("requires status closed, a real winner, and a non-polling date", () => {
    const base = {
      status: "closed",
      date_phase: "confirmed" as string | null,
      winner_place_name: "Din Tai Fung" as string | null,
      winner_label: null as string | null,
    };
    expect(isFullyDecided(base)).toBe(true);
  });

  it("accepts a free-text winner_label with no place record", () => {
    expect(
      isFullyDecided({
        status: "closed",
        date_phase: null,
        winner_place_name: null,
        winner_label: "That new bak kut teh place",
      })
    ).toBe(true);
  });

  it("is false while still open, even with a provisional winner field", () => {
    expect(
      isFullyDecided({
        status: "open",
        date_phase: null,
        winner_place_name: "Din Tai Fung",
        winner_label: null,
      })
    ).toBe(false);
  });

  it("is false while the date is still a Flexi poll", () => {
    expect(
      isFullyDecided({
        status: "closed",
        date_phase: "polling",
        winner_place_name: "Din Tai Fung",
        winner_label: null,
      })
    ).toBe(false);
  });

  it("is false when closed without any winner", () => {
    expect(
      isFullyDecided({
        status: "closed",
        date_phase: null,
        winner_place_name: null,
        winner_label: null,
      })
    ).toBe(false);
  });

  it("is false when cancelled", () => {
    expect(
      isFullyDecided({
        status: "cancelled",
        date_phase: null,
        winner_place_name: "Din Tai Fung",
        winner_label: null,
      })
    ).toBe(false);
  });
});
