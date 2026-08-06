-- 038_vote_push_throttle.sql
--
-- Push for "someone voted" (README "Not built yet" #1, first half) —
-- deferred out of the CHANGES_20260804.md batch pending exactly this
-- decision: a per-vote push would spam a popular Jio's host. Decided:
-- throttle to at most one push per event per ~10 minute window.
--
-- Not a true debounce (wait for voting to go quiet, then send one summary) —
-- Vercel Hobby's cron only runs once a day (see 031_recurring_series.sql's
-- comment), nowhere near frequent enough to wait out a quiet period. Instead
-- the vote route claims the window itself, inline, the instant a vote comes
-- in: first vote in a window sends immediately, later ones in the same
-- window are silently skipped. Simpler, no cron slot spent, same anti-spam
-- effect from the host's side.
--
-- SECURITY DEFINER because the caller claiming the window is whoever just
-- voted, not necessarily the host — and lunch_events_update (007_rls.sql)
-- only allows the host to write to lunch_events.

alter table lunch_events
  add column if not exists last_vote_push_at timestamptz;

create or replace function claim_vote_push_window(
  p_event_id uuid,
  p_window_seconds int default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  -- Atomic claim: only the request that actually advances the timestamp may
  -- send. Without the WHERE guard being part of the same UPDATE, two
  -- near-simultaneous votes could both read "window open" and both send.
  update lunch_events
  set last_vote_push_at = now()
  where id = p_event_id
    and (
      last_vote_push_at is null
      or last_vote_push_at < now() - (p_window_seconds || ' seconds')::interval
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function claim_vote_push_window(uuid, int) to authenticated;
