-- 089_recurring_series_notes.sql
--
-- Recurring Jios had no way to carry the host's own note ("meet at the
-- lobby," "bring cash") the way a one-off Jio's `lunch_events.notes`
-- already can — `generateDueOccurrences` always passed `notes: null` to
-- every generated occurrence since `recurring_series` never stored one.
-- Adds the missing column; `updateRecurringSeries` propagates a note
-- onto an already-generated, still-open occurrence unconditionally, same
-- as `vote_deadline_offset_minutes` — a note doesn't invalidate anyone's
-- existing vote/RSVP the way changing the options would.

alter table recurring_series
  add column if not exists notes text;
