/**
 * "Add to calendar" — CHANGES_20260818.md §5. A one-time snapshot, not a
 * live sync: neither format here updates if the Jio's time or place changes
 * after someone's added it. Fixed 1-hour duration for every entry — a Jio
 * has no end time on `LunchEvent`, only a `scheduled_at` instant.
 *
 * Both formats need the raw UTC instant, not a runtime-local rendering of
 * it — CHANGES_20260818.md §4, right above this in the same log, found
 * `formatTime`/`formatDate` silently render in whatever timezone the code
 * happens to be running in. `icsDateTime` sidesteps that class of bug
 * entirely by converting the ISO instant straight to UTC, never through a
 * locale-formatting call.
 */

const DURATION_MS = 60 * 60 * 1000;

/**
 * Loosened post-CHANGES_20260818.md §5: originally gated on the Jio being
 * fully decided (closed, with a winner). People wanted to block their own
 * calendar as soon as the *time* is settled, without waiting on the group
 * to finish voting on place or RSVPing — so only the date has to be fixed.
 * `date_phase !== "polling"` covers that (a Flexi Jio whose date is still a
 * poll has nothing to put on a calendar yet). `cancelled` is still excluded
 * — nothing to add once the Jio itself is off.
 */
export function canAddToCalendar(event: {
  status: string;
  date_phase?: string | null;
}): boolean {
  return event.status !== "cancelled" && event.date_phase !== "polling";
}

/** "2026-08-20T04:00:00.000Z" -> "20260820T040000Z" (iCalendar UTC form,
 *  also what Google Calendar's `dates=` param expects). */
function icsDateTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Escapes a plain-text iCalendar property value per RFC 5545 §3.3.11. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export interface CalendarEventInput {
  id: string;
  title: string;
  /** Raw ISO instant — converted to UTC internally, never pre-formatted. */
  scheduledAt: string;
  location: string;
  description: string;
  url: string;
}

/** A single-event `.ics` file, ready to serve as `text/calendar`. */
export function buildIcs(event: CalendarEventInput): string {
  const start = icsDateTime(event.scheduledAt);
  const end = icsDateTime(
    new Date(new Date(event.scheduledAt).getTime() + DURATION_MS).toISOString()
  );
  const stamp = icsDateTime(new Date().toISOString());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jio//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@jio`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // iCalendar lines are terminated with CRLF, not just LF.
  return lines.join("\r\n") + "\r\n";
}

/** A one-tap "Add to Google Calendar" link — no download, no app switch. */
export function googleCalendarUrl(event: CalendarEventInput): string {
  const start = icsDateTime(event.scheduledAt);
  const end = icsDateTime(
    new Date(new Date(event.scheduledAt).getTime() + DURATION_MS).toISOString()
  );

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
