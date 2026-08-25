-- 058_reopen_event.sql
--
-- Lets a host undo a close and put a Jio back into voting. 030_cancel_event.sql
-- called this out as a deliberately separate, bigger action when "cancelled"
-- was built ("un-deciding [a closed Jio] is a different, larger action than
-- the one being built here") — this is that action, asked for directly.
--
-- Only from 'closed' (an 'open' Jio has nothing to reopen, a 'cancelled' one
-- is a terminal state of its own) and only while `scheduled_at` is still in
-- the future — reopening voting for a lunch that's already happened doesn't
-- mean anything.
--
-- Existing ballots are left alone: a vote already persists until its owner
-- recasts it (castBallot replaces, never accumulates), so "reopen" just
-- means "accept new/changed ballots again," not "clear the board." What
-- does get cleared is `winner_place_id` and `closed_at`, since neither
-- describes reality once voting is live again — closing later recomputes
-- both, same as the first time.
--
-- Same reasoning as cancel_event for going through a dedicated
-- SECURITY DEFINER function rather than a plain client update: lunch_events
-- has no column-level grant restriction (closeEvent/editEventWinner/
-- rescheduleEvent all still do a plain host-scoped update), but a new
-- structural state change gets its own gated path so the raw-write version
-- of that bug never gets a chance to exist for this transition either.
create or replace function reopen_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host_id uuid;
  v_status text;
  v_scheduled_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select host_id, status, scheduled_at into v_host_id, v_status, v_scheduled_at
    from lunch_events where id = p_event_id;
  if not found then
    raise exception 'That Jio does not exist';
  end if;

  if v_host_id is distinct from v_uid then
    raise exception 'Only the host can reopen this Jio for voting';
  end if;

  if v_status <> 'closed' then
    raise exception 'Only a closed Jio can be reopened for voting';
  end if;

  if v_scheduled_at <= now() then
    raise exception 'Can''t reopen voting for a Jio that''s already happened';
  end if;

  update lunch_events
    set status = 'open', winner_place_id = null, closed_at = null
    where id = p_event_id;
end;
$$;

grant execute on function reopen_event(uuid) to authenticated;
