-- 039_close_reminder.sql
--
-- Pre-close reminder (README "Not built yet" #1, second half) — the other
-- trigger deferred out of the CHANGES_20260804.md batch. Decided: there is
-- no actual poll-close deadline anywhere in the schema (closing is always a
-- manual host click), so "before close" is redefined as "before the Jio's
-- own scheduled_at" — the one clock every Jio already has, and the one that
-- actually matters, since voting after lunch has happened is moot anyway.
--
-- Firing this needs to check "is any of my Jios within 30 minutes" on a
-- clock, which a page load can't guarantee happens near. This project
-- already chose, for recurring-series generation, to stay lazy rather than
-- spend Vercel Hobby's one daily cron slot (031_recurring_series.sql) — same
-- call here, for the same reason: whoever loads Home or Jios (host, invitee,
-- kaki member, anyone with a stake) triggers the check for their own events
-- as a side effect, same shape as generateDueOccurrences. It only actually
-- reaches non-openers because the point of *this* feature is a push, not the
-- page itself — but the check firing at all still depends on someone, not
-- necessarily the person being reminded, having the app open around then.
-- Stated plainly as a known limitation, same as recurring series' own.
--
-- SECURITY DEFINER for the same reason as 038: the caller claiming a given
-- event's reminder is whoever's page load happened to trigger the check,
-- not necessarily that event's host.

alter table lunch_events
  add column if not exists reminder_sent_at timestamptz;

create or replace function claim_event_reminder(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  -- One-shot, not a rearming window like 038's — a Jio only ever needs one
  -- "starting soon" nudge.
  update lunch_events
  set reminder_sent_at = now()
  where id = p_event_id
    and reminder_sent_at is null
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function claim_event_reminder(uuid) to authenticated;
