-- 029_placeless_vote_options.sql
--
-- "Vote first, prompt after" — CHANGES_20260801.md §8. A non-host typing a
-- place name into the add-a-place search on an open vote and getting no
-- results had no way out; the Jio-creation form already solves this with
-- "Not here? Add a place," the voting page's search never got the same
-- treatment.
--
-- Decided 1 Aug: the free-text option submits as a vote immediately, with no
-- `places` row required. Only afterward, non-compulsorily, does the app ask
-- whether to add it to the pool.
--
-- Shape chosen here, deliberately smaller than the "nullable place_id" shape
-- the working log floated: `event_options.place_id` stays NOT NULL and
-- keeps its existing role as the thing `event_votes.place_id` points at —
-- which already has no foreign key to `places` (see below), so it was
-- already just an opaque id as far as voting, tallying and Borda counting
-- are concerned. A free-text option gets a *generated* id here instead of a
-- real place's id, and `label` is what marks it as one. That means
-- `event_votes`, `lib/voting.ts` and every tally/winner code path need zero
-- changes — the existing `s.places.find(p => p.id === o.place_id)` pattern
-- already degrades to "no place" correctly for an id that matches nothing.
-- The trade-off is explicit: this leans on the *absence* of a constraint
-- rather than declaring the real shape (nullable place_id + check), which
-- is easy to lose track of if someone adds that FK back later without
-- reading this file.
--
-- `lunch_events.winner_place_id` is the one place that *did* have a foreign
-- key to `places`, which would reject a free-text option winning outright —
-- dropped below for the same reason.

alter table event_options add column if not exists label text;

alter table lunch_events drop constraint if exists lunch_events_winner_place_id_fkey;

-- ------------------------------------------------- attach_place_to_option --
-- Upgrades a free-text option to a real place, once someone accepts the
-- "add it to the pool?" prompt. A structural state change like this goes
-- through a dedicated function rather than a raw client write, same shape
-- as block_place/unblock_place in 017_admin_and_moderation.sql — the
-- alternative is a plain UPDATE that some future refactor forgets to gate.
--
-- Moves any votes already cast for the draft option along with it, so
-- ranking it before it became a real place is not silently discarded. A
-- voter who — vanishingly rarely — had *also* separately ranked the same
-- real place keeps that vote and loses the now-duplicate draft one, rather
-- than the whole attach failing on a primary-key collision.
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

  if v_option.added_by is distinct from v_uid
     and v_event.host_id is distinct from v_uid then
    raise exception
      'Only whoever added this option, or the host, can attach a place to it';
  end if;

  if not exists (select 1 from places where id = p_new_place_id) then
    raise exception 'That place does not exist';
  end if;

  update event_options
    set place_id = p_new_place_id, label = null
    where event_id = p_event_id and place_id = p_old_place_id;

  update event_votes
    set place_id = p_new_place_id
    where event_id = p_event_id
      and place_id = p_old_place_id
      -- Skip a voter who already separately ranked the real place — moving
      -- the draft vote on top of it would collide on the primary key.
      and not exists (
        select 1 from event_votes v2
        where v2.event_id = p_event_id
          and v2.user_id = event_votes.user_id
          and v2.place_id = p_new_place_id
      );

  -- Leftover draft-id votes are the ones just skipped above for colliding —
  -- the real-place vote they already had stands, so this is a de-dup, not a
  -- loss of a rank nobody has anywhere else.
  delete from event_votes
    where event_id = p_event_id and place_id = p_old_place_id;

  update lunch_events
    set winner_place_id = p_new_place_id
    where id = p_event_id and winner_place_id = p_old_place_id;
end;
$$;

grant execute on function attach_place_to_option(uuid, uuid, uuid) to authenticated;
