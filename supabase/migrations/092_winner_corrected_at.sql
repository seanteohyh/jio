-- 092_winner_corrected_at.sql
--
-- "Where did you actually go?" (editEventWinner, CHANGES_20260819c.md §2)
-- replaces winner_place_id after the fact with no record that it ever
-- happened — the share chit and the on-page Final count both went on
-- showing the corrected place's leftover vote points as if that were how
-- it won, which reads as a real result even though the group's own ballots
-- never actually decided it. `winner_corrected_at` marks that a correction
-- happened; the chit and Final count both swap the winner's points for
-- "Overruled" once it's set, rather than attributing a vote count to a
-- result nobody actually voted for.
--
-- Cleared on reopen (reopenEvent, 058_reopen_event.sql already clears
-- winner_place_id/closed_at the same way) — a fresh close cycle starts
-- with a clean slate, corrected or not.

alter table lunch_events
  add column if not exists winner_corrected_at timestamptz;

-- Reproduces 058_reopen_event.sql's function body in full (create or
-- replace replaces the whole thing), additionally clearing
-- winner_corrected_at alongside winner_place_id/closed_at — a fresh close
-- cycle starts with a clean slate, corrected or not.
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
    set status = 'open', winner_place_id = null, closed_at = null,
        winner_corrected_at = null
    where id = p_event_id;
end;
$$;

grant execute on function reopen_event(uuid) to authenticated;
