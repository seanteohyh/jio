-- Offices had select and insert policies (007_rls.sql, tightened to
-- admin-only by 017_admin_and_moderation.sql) but no update or delete
-- policy at all — RLS defaults to deny, so an admin editing or removing an
-- office in live mode would have silently failed at the database layer
-- even though the app-side admin check would have let the request through.
--
-- This surfaced as a real bug: adding a second office (e.g. moving from one
-- building to another) never actually changed anything the app uses, since
-- every write path that needs "the" office and wasn't given one explicitly
-- (a new Jio, a recurring series, /api/route's default) falls back to the
-- same fixed DEFAULT_OFFICE.id — a second row alongside it changes nothing.
-- Editing the existing office in place is what actually works, and that
-- needs its own update/delete policies, same admin gate as insert.
drop policy if exists "offices_update" on offices;
create policy "offices_update" on offices
  for update to authenticated
  using (exists (select 1 from admins where user_id = auth.uid()))
  with check (exists (select 1 from admins where user_id = auth.uid()));

drop policy if exists "offices_delete" on offices;
create policy "offices_delete" on offices
  for delete to authenticated
  using (exists (select 1 from admins where user_id = auth.uid()));
