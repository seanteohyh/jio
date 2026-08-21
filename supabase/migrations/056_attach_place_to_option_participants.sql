-- 056_attach_place_to_option_participants.sql
--
-- Widens attach_place_to_option's authorization — CHANGES_20260819d.md §1,
-- "a persistent link so anyone can help register a free-text option as a
-- real place." The doc's own investigation claimed this function already
-- had no host/adder restriction; that turned out to be wrong (029's
-- function, below, still checked `added_by`/`host_id`). Fixing that
-- premise is what makes the new persistent link (any Jio participant, any
-- time it's open) actually work rather than dead-ending in a permission
-- error for anyone who is neither the host nor whoever originally typed
-- the free-text option in.
--
-- The new check mirrors event_options_insert_participant
-- (013_event_invitees.sql) exactly: host, a member of the linked kaki, or
-- an explicit invitee — the same tier already allowed to add options and
-- vote in the first place, so anyone who can see this Jio's ballot can
-- also help register one of its free-text options as a real place.
create or replace function attach_place_to_option(
  p_event_id uuid,
  p_old_place_id uuid,
  p_new_place_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_option record;
  v_event record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_option from event_options
    where event_id = p_event_id and place_id = p_old_place_id;
  if not found then
    raise exception 'That option does not exist';
  end if;
  if v_option.label is null then
    raise exception 'That option is already a real place';
  end if;

  select * into v_event from lunch_events where id = p_event_id;
  if not found then
    raise exception 'That Jio does not exist';
  end if;

  if v_event.host_id is distinct from v_uid
     and not exists (
       select 1 from kaki_members m
       where v_event.kaki_id is not null
         and m.kaki_id = v_event.kaki_id and m.user_id = v_uid
     )
     and not exists (
       select 1 from event_invitees i
       where i.event_id = p_event_id and i.user_id = v_uid
     ) then
    raise exception
      'Only the host, kaki members or invitees can add places';
  end if;

  if not exists (select 1 from places where id = p_new_place_id) then
    raise exception 'That place does not exist';
  end if;

  update event_options
    set place_id = p_new_place_id, label = null
    where event_id = p_event_id and place_id = p_old_place_id;

  -- Votes already cast for the draft option move with it, same as before —
  -- a voter who also separately ranked the real place keeps that vote and
  -- loses the now-duplicate draft one, rather than the whole attach failing
  -- on a primary-key collision.
  update event_votes v
    set place_id = p_new_place_id
    where v.event_id = p_event_id
      and v.place_id = p_old_place_id
      and not exists (
        select 1 from event_votes v2
        where v2.event_id = p_event_id
          and v2.user_id = v.user_id
          and v2.place_id = p_new_place_id
      );

  delete from event_votes
    where event_id = p_event_id and place_id = p_old_place_id;

  update lunch_events
    set winner_place_id = p_new_place_id
    where id = p_event_id and winner_place_id = p_old_place_id;
end;
$$;

grant execute on function attach_place_to_option(uuid, uuid, uuid) to authenticated;
