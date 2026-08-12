-- 044_merge_carries_created_at.sql
--
-- CHANGES_20260812.md §5 — confirmed bug: /admin/analytics' "New users"
-- chart (get_admin_analytics, migration 035) counts `profiles.created_at`,
-- one row per account. nameAuth.signInWithName always passes the freshly
-- minted anonymous session as `p_keep_user_id` and the real, previously-
-- existing account as `p_merge_user_id` — so every forced re-login
-- (§6/§7's browser/icon churn, iOS storage eviction, anything else that
-- drops a session) survives as the newest possible UUID and deletes the
-- one row holding the person's actual original signup date. The chart
-- reads this as a brand-new signup, permanently, since the row it would
-- have read the true date from is gone. `create or replace` on the same
-- signature, full body carried forward from 043 plus one new block, same
-- "carry the meaningful field forward" shape as 043's admin fix.
--
-- This is the one exception to `merge_user_accounts` otherwise never
-- touching `profiles` (see 040's original comment) — narrow on purpose,
-- only the one column this bug is actually about.

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
  v_merge_created_at timestamptz;
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

  -- admins — bare `user_id` PK, no FK to auth.users (017), so it's neither
  -- reassigned above nor cascade-deleted when the old account is later
  -- retired. Keep the surviving account's own admin row if it already has
  -- one (already an admin, nothing to do); otherwise carry the merged-in
  -- account's row forward — same "surviving account's own row wins, the
  -- other is dropped" shape as every collision above, just on a table with
  -- no composite key to actually collide on.
  if exists (select 1 from admins where user_id = p_merge_user_id) then
    if not exists (select 1 from admins where user_id = p_keep_user_id) then
      insert into admins (user_id, granted_by, granted_at)
      select p_keep_user_id, granted_by, granted_at
      from admins where user_id = p_merge_user_id;
    end if;
    delete from admins where user_id = p_merge_user_id;
  end if;

  -- profiles.created_at — the survivor's signup date should read as
  -- continuous no matter which UUID happened to survive. Both rows are
  -- guaranteed to exist at this point (migration 011's trigger creates one
  -- for every auth.users row, and the merge match itself was found by
  -- querying profiles), so this is a plain two-row comparison, not a
  -- collision to resolve.
  select created_at into v_merge_created_at
    from profiles where user_id = p_merge_user_id;

  if v_merge_created_at is not null then
    update profiles
      set created_at = least(created_at, v_merge_created_at)
      where user_id = p_keep_user_id;
  end if;
end;
$$;

grant execute on function merge_user_accounts(uuid, uuid) to authenticated;
