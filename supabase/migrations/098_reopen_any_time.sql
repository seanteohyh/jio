-- 098_reopen_any_time.sql
--
-- Drops reopen_event's "only while scheduled_at is still in the future"
-- guard (058_reopen_event.sql's original reasoning: "reopening voting for
-- a lunch that's already happened doesn't mean anything"). Asked for
-- directly by the host: a Jio can end up stuck past its own scheduled time
-- for reasons that have nothing to do with the lunch itself having
-- happened — most concretely, 097_lazy_vote_deadline_close.sql's own bug
-- report, where a Jio sat open well past both its vote deadline and its
-- scheduled time before anyone's page load triggered the lazy close. A
-- host should always be able to put a closed Jio back into voting,
-- regardless of whether its scheduled time has already passed.
--
-- Reproduces 092_winner_corrected_at.sql's function body in full (create
-- or replace replaces the whole thing), with the scheduled_at check
-- removed and nothing else changed.

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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select host_id, status into v_host_id, v_status
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

  update lunch_events
    set status = 'open', winner_place_id = null, closed_at = null,
        winner_corrected_at = null
    where id = p_event_id;
end;
$$;

grant execute on function reopen_event(uuid) to authenticated;
