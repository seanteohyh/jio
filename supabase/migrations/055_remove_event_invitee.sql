-- 055_remove_event_invitee.sql
--
-- Lets a host remove someone from a Jio — CHANGES_20260819b.md, "host can
-- add or remove users, both before and after confirmed." Adding was already
-- possible (event_invitees_insert, 013_event_invitees.sql, host-only, no
-- status check); removing had no path at all.
--
-- event_invitees_delete (013) already lets the host delete the invitee row
-- itself. What it can't reach is the removed person's own rows on
-- event_rsvps / event_votes / event_date_votes — those are all
-- `user_id = auth.uid()` only (007_rls.sql, 024_flexi_jio.sql), so a plain
-- client-side delete-cascade from the host's session would silently affect
-- zero rows on exactly the tables that matter, leaving a stray ballot/RSVP
-- behind for someone no longer in the Jio. Same shape as cancel_event
-- (030_cancel_event.sql): a structural, cross-table, host-privileged change
-- goes through one security-definer function rather than loosening those
-- tables' RLS to "the host can delete anyone's row," which would outlive
-- this one specific use.
--
-- Deliberately no status check (unlike cancel_event) — removing someone is
-- wanted "both before and after confirmed," so this works on an open,
-- closed or cancelled Jio alike. What they added (an option, a candidate
-- date) is left alone; only their own personal responses go.
create or replace function remove_event_invitee(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select host_id into v_host_id from lunch_events where id = p_event_id;
  if not found then
    raise exception 'That Jio does not exist';
  end if;

  if v_host_id is distinct from v_uid then
    raise exception 'Only the host can remove people';
  end if;

  if p_user_id = v_host_id then
    raise exception 'The host can''t be removed';
  end if;

  delete from event_invitees where event_id = p_event_id and user_id = p_user_id;
  delete from event_rsvps where event_id = p_event_id and user_id = p_user_id;
  delete from event_votes where event_id = p_event_id and user_id = p_user_id;
  delete from event_date_votes where event_id = p_event_id and user_id = p_user_id;
end;
$$;

grant execute on function remove_event_invitee(uuid, uuid) to authenticated;
