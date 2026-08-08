-- 042_list_admin_ids.sql
--
-- CHANGES_20260807c.md §3 item 5 — notifying "an admin" (not one specific
-- person) when a declined name-match confirms a real duplicate needs the
-- full admin list. `admins_select_self` (007_rls.sql) deliberately only
-- lets a session see its own row — enough for an `isAdmin` check, not
-- enough to enumerate everyone. SECURITY DEFINER for the same reason as
-- every other "read across the admin allowlist" case in this schema.

create or replace function list_admin_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select user_id from admins;
$$;

grant execute on function list_admin_ids() to authenticated;
