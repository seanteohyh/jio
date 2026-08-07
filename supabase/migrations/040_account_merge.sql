-- 040_account_merge.sql
--
-- Shared reassignment function behind both CHANGES_20260807.md §4
-- (self-service "type your old name to reclaim it") and §5 (admin-triggered
-- merge tool). Both boil down to the identical operation — move a user's
-- data from an old, orphaned account onto a live one — so it's built once
-- here and given two front doors in application code rather than twice as
-- separate implementations that could drift apart.
--
-- Deliberately does NOT touch `auth.users` or `profiles`. Deleting an
-- `auth.users` row isn't something any RLS-scoped SQL function can do —
-- Supabase reserves that to the Auth Admin API, which needs the service
-- role — so the caller (application code) does that step itself afterward,
-- the same privileged path the discovery cron already uses for its one
-- cross-user write (see serviceClient.ts). `profiles.user_id` has
-- `references auth.users(id) on delete cascade`, so deleting the old auth
-- user removes its profile automatically — nothing to do here for that one.
--
-- Every other `user_id`-owned table below has no such FK (deliberately —
-- see each table's own migration), so each needs an explicit move. Tables
-- keyed by a composite primary key that includes `user_id` (votes, RSVPs,
-- invitees, kaki membership, wishlist) can collide if both accounts already
-- have a row for the same (event/kaki/place) — resolved by keeping the
-- surviving account's own row and dropping the merged-in duplicate, same
-- shape as `attach_place_to_option`'s collision handling (029).

create or replace function merge_user_accounts(
  p_keep_user_id uuid,
  p_merge_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_keep_user_id is null or p_merge_user_id is null then
    raise exception 'Both accounts are required';
  end if;
  if p_keep_user_id = p_merge_user_id then
    raise exception 'Cannot merge an account into itself';
  end if;

  select exists(select 1 from admins where user_id = v_uid) into v_is_admin;

  -- Self-service (§4): only ever into your own current session. Admin (§5):
  -- picks both sides directly, for someone who can't or won't do this
  -- themselves. Nobody else may move a stranger's data around.
  if v_uid is distinct from p_keep_user_id and not v_is_admin then
    raise exception 'You may only merge another account into your own';
  end if;

  -- lunch_events.host_id — no collision possible, one host per event.
  update lunch_events set host_id = p_keep_user_id
    where host_id = p_merge_user_id;

  -- kakis.created_by — likewise, one creator per group.
  update kakis set created_by = p_keep_user_id
    where created_by = p_merge_user_id;

  -- event_votes — PK (event_id, user_id, place_id). If both accounts voted
  -- the same place on the same Jio, keep the surviving account's own rank.
  delete from event_votes ev
    where ev.user_id = p_merge_user_id
      and exists (
        select 1 from event_votes ek
        where ek.event_id = ev.event_id
          and ek.place_id = ev.place_id
          and ek.user_id = p_keep_user_id
      );
  update event_votes set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- event_rsvps — PK (event_id, user_id). Keep the surviving account's own
  -- response where both answered the same Jio.
  delete from event_rsvps er
    where er.user_id = p_merge_user_id
      and exists (
        select 1 from event_rsvps ek
        where ek.event_id = er.event_id and ek.user_id = p_keep_user_id
      );
  update event_rsvps set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- event_invitees — PK (event_id, user_id).
  delete from event_invitees ei
    where ei.user_id = p_merge_user_id
      and exists (
        select 1 from event_invitees ek
        where ek.event_id = ei.event_id and ek.user_id = p_keep_user_id
      );
  update event_invitees set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- kaki_members — PK (kaki_id, user_id).
  delete from kaki_members km
    where km.user_id = p_merge_user_id
      and exists (
        select 1 from kaki_members kk
        where kk.kaki_id = km.kaki_id and kk.user_id = p_keep_user_id
      );
  update kaki_members set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- wishlist — PK (user_id, place_id).
  delete from wishlist w
    where w.user_id = p_merge_user_id
      and exists (
        select 1 from wishlist wk
        where wk.place_id = w.place_id and wk.user_id = p_keep_user_id
      );
  update wishlist set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- visits — own `id` PK, no collision possible.
  update visits set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- push_subscriptions — unique on `endpoint`, not on user_id; no collision.
  update push_subscriptions set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  -- user_prefs — PK is user_id itself, so at most one row per account.
  -- Keep the surviving account's own prefs if it has any; otherwise adopt
  -- the merged-in account's.
  if not exists (select 1 from user_prefs where user_id = p_keep_user_id) then
    update user_prefs set user_id = p_keep_user_id
      where user_id = p_merge_user_id;
  else
    delete from user_prefs where user_id = p_merge_user_id;
  end if;
end;
$$;

grant execute on function merge_user_accounts(uuid, uuid) to authenticated;
