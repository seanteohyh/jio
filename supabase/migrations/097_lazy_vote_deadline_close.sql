-- 097_lazy_vote_deadline_close.sql
--
-- Bug report: a Jio whose vote_end_at has passed just sits open forever if
-- the external cron (`/api/cron/vote-deadline`, 088_vote_deadline.sql)
-- isn't actually configured — the countdown on the Jio page already shows
-- "Voting: Closed" (a pure client-side comparison against `now`), but
-- nothing has actually force-closed it server-side, so a voter can't tell
-- whether they can still vote, and the host has no "Reopen" button to
-- reach for since there's nothing yet to reopen. Same class of gap as
-- 039_close_reminder.sql's reminder, and the same fix shape: a lazy,
-- page-load-triggered fallback alongside the cron sweep, not instead of it.
--
-- Unlike the reminder's one-shot flag (host-only RLS has no bearing on a
-- plain additive push), this is a genuine state-changing write to
-- `lunch_events`, and `lunch_events_update` (007_rls.sql) is host-only —
-- but the lazy trigger fires from *any* viewer's page load, not just the
-- host's. SECURITY DEFINER, same reasoning as claim_event_reminder /
-- claim_vote_push_window. Every guard condition is re-checked inside the
-- function itself, not just trusted from the caller, since this is
-- `grant`ed to every authenticated user and callable directly — an
-- attempted early or out-of-order close is simply a no-op here, same as
-- calling it on an already-closed Jio. The winner is computed by the
-- caller (same Borda logic the cron sweep already uses) and passed in,
-- not recomputed in SQL — but it's constrained to one of this event's own
-- options (or null), so a bad-faith caller can pick among the legitimate
-- options at most, never inject an unrelated place.

create or replace function close_event_if_past_vote_deadline(
  p_event_id uuid,
  p_winner_place_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update lunch_events
  set status = 'closed',
      winner_place_id = p_winner_place_id,
      closed_at = now()
  where id = p_event_id
    and status = 'open'
    and date_phase != 'polling'
    and vote_end_at is not null
    and vote_end_at <= now()
    and (
      p_winner_place_id is null
      or exists (
        select 1 from event_options
        where event_id = p_event_id and place_id = p_winner_place_id
      )
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function close_event_if_past_vote_deadline(uuid, uuid) to authenticated;
