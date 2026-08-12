-- 045_add_kaki_member.sql
--
-- CHANGES_20260812.md §1 — the only way to grow a Kaki today is the invite
-- link; this adds a direct "search and add" path on top of the existing
-- discovery groundwork (docs/user-discovery.md §4.1's /api/users,
-- InvitePicker's pattern). `kaki_members_insert` (010_kakis.sql) is
-- deliberately `user_id = auth.uid()` only — "You may add yourself and
-- only yourself. No adding people to groups." — so adding someone *else*
-- needs the same kind of narrow, gated exception as `join_event_via_invite`
-- (036), not a loosened policy.
--
-- Decided: any current member may add anyone, not creator/admin-only —
-- matches the existing trust level (the invite link already lets anyone
-- holding it join themselves; Kakis have no privileged-member concept
-- anywhere else in the schema).

create or replace function add_kaki_member(p_kaki_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from kaki_members
    where kaki_id = p_kaki_id and user_id = v_uid
  ) then
    raise exception 'Only a member of this group can add someone to it';
  end if;

  -- on conflict do nothing rather than erroring — the UI is expected to
  -- already filter out existing members, but this is the real gate, not
  -- the UI, so it stays correct even if that filtering is ever bypassed.
  insert into kaki_members (kaki_id, user_id)
  values (p_kaki_id, p_user_id)
  on conflict (kaki_id, user_id) do nothing;
end;
$$;

grant execute on function add_kaki_member(uuid, uuid) to authenticated;
