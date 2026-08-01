-- 030_cancel_event.sql
--
-- Lets a host call off a Jio — CHANGES_20260801.md §9. `status` on
-- lunch_events has accepted 'cancelled' since 006_events.sql; nothing ever
-- moved it there.
--
-- A cancelled Jio is a new terminal state, not a reuse of 'closed': today an
-- event that ends without a decision already reads as "Closed without a
-- winner — nobody voted in time," and a host calling it off on purpose needs
-- to read differently, or the cancelling host's clear intent gets flattened
-- into "nobody voted."
--
-- Decided 1 Aug: stays visible afterward, marked "Cancelled" — it does not
-- drop out of Home or the Jios tab. Host-only (the assumed default; nothing
-- said otherwise about admins). Only from 'open' — a Jio that's already
-- closed has a decision on record, and un-deciding it is a different, larger
-- action than the one being built here.
--
-- lunch_events has no column-level grant restriction the way 017 gave
-- places (closeEvent and confirmEventDate both still do a plain client
-- update, gated only by the host-scoped RLS policy from 007_rls.sql) —
-- reworking that is a bigger, unrequested change to how the whole table is
-- written. What this migration does instead is give the *new* transition
-- its own gated path, same shape as block_place: a structural state change
-- goes through a dedicated function, so the raw-write version of this bug
-- (see §1) never gets a chance to exist for `cancelled` in the first place.
create or replace function cancel_event(p_event_id uuid)
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
    raise exception 'Only the host can cancel this Jio';
  end if;

  if v_status = 'cancelled' then
    raise exception 'This Jio is already cancelled';
  end if;
  if v_status = 'closed' then
    raise exception 'This Jio is already closed';
  end if;

  update lunch_events set status = 'cancelled' where id = p_event_id;
end;
$$;

grant execute on function cancel_event(uuid) to authenticated;
