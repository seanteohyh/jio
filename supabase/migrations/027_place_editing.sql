-- 027_place_editing.sql
--
-- Fixes the "permission denied for table places" error hit in production on
-- 1 Aug when the edit form started writing more of the row than the grant in
-- 017_admin_and_moderation.sql was ever updated to allow.
--
-- 017 hand-listed the editable columns: whatever the app happened to write at
-- the time. That was fine until the next migration added a column and nobody
-- remembered to extend the list — which is exactly what happened, and will
-- happen again the next time someone adds a field to `places` and forgets
-- this file exists. So instead of a hand-written allow-list, this derives it:
-- grant everything except the columns that must never move through a plain
-- client UPDATE. Adding a new user-editable column to `places` now needs no
-- migration here at all; adding a new *protected* one does, same as today.
--
-- `status` is excluded the same way 017 excluded it — deliberately at the
-- grant level, not by comparing old/new values in a policy, which is cheaper
-- and much harder to get subtly wrong. It keeps moving only through
-- block_place / unblock_place / review_place.
--
-- Requirement confirmed 1 Aug: any signed-in user may edit any place. The
-- places_update policy (007_rls.sql) is already `using (true) with check
-- (true)` — not creator-scoped — so this migration does not need to change
-- it. It's reasserted below anyway so this file is a complete, self-
-- contained fix if it's ever the first of the two to actually run.

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name not in (
        'id', 'created_by', 'created_at', 'status',
        -- Trigger-maintained aggregates (021, 022) — a plain edit must not
        -- be able to fake a rating or clear a flag.
        'avg_rating', 'visit_count', 'rating_updated_at', 'has_pending_flag',
        -- Provenance of how the row got here, not something a correction
        -- should touch.
        'osm_id', 'source'
      );

  execute 'revoke update on places from authenticated';
  execute format('grant update (%s) on places to authenticated', v_cols);
end $$;

drop policy if exists "places_update" on places;
create policy "places_update" on places
  for update to authenticated using (true) with check (true);

-- --------------------------------------------------------- sanity checks ---
-- Read these after running. `status` must not appear in the first result;
-- the second must return exactly one row.

select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'places'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
order by column_name;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'places'
  and cmd = 'UPDATE';
