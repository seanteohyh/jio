import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, canAddToCalendar } from "@/lib/calendar";

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

describe("canAddToCalendar", () => {
  it("is true while still open, with no winner yet, as long as the date isn't a poll", () => {
    expect(
      canAddToCalendar({ status: "open", date_phase: null })
    ).toBe(true);
  });

  it("is true for a Flexi Jio once its date is confirmed, even while still open", () => {
    expect(
      canAddToCalendar({ status: "open", date_phase: "confirmed" })
    ).toBe(true);
  });

  it("is true once closed, winner or not", () => {
    expect(canAddToCalendar({ status: "closed", date_phase: null })).toBe(
      true
    );
  });

  it("is false while the date is still a Flexi poll", () => {
    expect(
      canAddToCalendar({ status: "open", date_phase: "polling" })
    ).toBe(false);
  });

  it("is false when cancelled, even with a fixed date", () => {
    expect(
      canAddToCalendar({ status: "cancelled", date_phase: "confirmed" })
    ).toBe(false);
  });
});
