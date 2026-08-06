-- 036_join_event_via_invite.sql
--
-- CHANGES_20260804.md §4 — confirmed not a bug in the Jios tab's filter (it
-- already matches Home's query exactly), but a real gap one step earlier:
-- src/app/e/[token]/page.tsx's own comment says "there is no separate
-- accept step, because following the link is the acceptance" — but nothing
-- ever actually wrote that acceptance down. Reading an event via its
-- invite token was always allowed (event_invitees_insert already assumed
-- "possession of the link implies an invite" as a *read* permission), but
-- no `event_invitees` row was created, so a visitor with no other
-- footprint — never RSVP'd, never voted, not a Kaki member — was
-- invisible to listEvents() everywhere it's used, Jios tab included. Home
-- happened to show it anyway in this specific report only because
-- Home and the Jios tab both call that same listEvents(); had the visitor
-- never interacted at all, Home would have missed it too.
--
-- SECURITY DEFINER, not a plain client insert, because event_invitees_insert
-- (013_event_invitees.sql) is host-only by design — a visitor inserting a
-- row for themselves needs the same kind of deliberate, gated exception as
-- attach_place_to_option or cancel_event, not a loosened RLS policy that
-- would also let a host be invited-added by anyone who merely knows their
-- event exists.
--
-- Deliberately narrow: only ever inserts a row for auth.uid() itself, never
-- for an id passed in, so this can't be used to invite anyone else.
create or replace function join_event_via_invite(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_event from lunch_events where id = p_event_id;
  if not found then
    raise exception 'That Jio does not exist';
  end if;

  if v_event.host_id = v_uid then
    return;
  end if;

  insert into event_invitees (event_id, user_id)
  values (p_event_id, v_uid)
  on conflict (event_id, user_id) do nothing;
end;
$$;

grant execute on function join_event_via_invite(uuid) to authenticated;
