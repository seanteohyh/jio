-- 046_public_place_preview.sql
-- CHANGES_20260812.md §4: a place page a signed-out visitor can actually see.
--
-- `places_select` (007_rls.sql) is `for select to authenticated using (true)`
-- — an anonymous request runs as Postgres role `anon`, which that policy
-- never grants anything to, so a bare `select` from `places` returns nothing
-- for a signed-out visitor. Rather than loosen the RLS policy itself (which
-- would hand every column, including `created_by` and `notes`, to `anon`),
-- this follows the same SECURITY DEFINER pattern as `list_admin_ids` and
-- `add_kaki_member`: one function, one narrow column list, callable by a
-- role that owns no table privileges at all.
--
-- Scoped to `status = 'active'` on purpose — a place still waiting for
-- human review, or one an admin has blocked, has no business being the
-- first thing a stranger sees when a link gets forwarded around.

create or replace function get_public_place(p_place_id uuid)
returns table (
  id uuid,
  name text,
  address text,
  cuisine text[],
  custom_cuisine_tags text[],
  budget_tier smallint,
  best_dishes text[],
  avg_rating numeric,
  visit_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      p.id,
      p.name,
      p.address,
      p.cuisine,
      p.custom_cuisine_tags,
      p.budget_tier,
      p.best_dishes,
      p.avg_rating,
      p.visit_count
    from places p
    where p.id = p_place_id
      and p.status = 'active';
end;
$$;

grant execute on function get_public_place(uuid) to anon, authenticated;
