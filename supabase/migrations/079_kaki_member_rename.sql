-- 079_kaki_member_rename.sql
--
-- Renaming a Kaki was creator-only (010_kakis.sql's `kakis_update`). Widen
-- it to any current member — the same trust level `add_kaki_member`
-- already extends to "invite someone in": once you're a member, you're
-- trusted with the group's shared state, not just whoever happened to
-- create it. Safe to check membership here (unlike `kakis_select`'s own
-- comment about recursion): `kaki_members_select` is `using (true)`, so
-- this doesn't loop back into `kakis` at all.

drop policy if exists "kakis_update" on kakis;
create policy "kakis_update" on kakis
  for update to authenticated
  using (
    exists (
      select 1 from kaki_members
      where kaki_members.kaki_id = kakis.id
        and kaki_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from kaki_members
      where kaki_members.kaki_id = kakis.id
        and kaki_members.user_id = auth.uid()
    )
  );
